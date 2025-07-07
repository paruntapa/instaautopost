require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const ffmpeg = require('fluent-ffmpeg');

// Configuration
const REELS_FILE = 'reels.txt';
const REELS_FOLDER = path.join(__dirname, 'reels');
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const IG_USER_ID = process.env.MY_IG_USER_ID || process.env.IG_USER_ID;

// Core Instagram processing functions
function extractShortcode(url) {
    try {
        const regex = /(?:instagram\.com\/(?:p|reel)\/|instagr\.am\/p\/)([A-Za-z0-9_-]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    } catch (error) {
        console.error('Error extracting shortcode:', error.message);
        return null;
    }
}

async function getVideoDataFromPage(shortcode) {
    const url = `https://www.instagram.com/reel/${shortcode}/`;
    const maxRetries = 3;
    
    const userAgents = [
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
    ];
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔍 Scraping (attempt ${attempt}): ${url}`);
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                },
                timeout: 15000
            });
            
            const $ = cheerio.load(response.data);
            let videoUrl = null;
            let caption = '';
            
            // Method 1: Extract from og:description meta tag
            const ogDescription = $('meta[property="og:description"]').attr('content');
            if (ogDescription) {
                console.log('📝 Found caption via og:description');
                caption = ogDescription;
            }
            
            // Method 2: Extract from JSON-LD structured data
            if (!caption) {
                $('script[type="application/ld+json"]').each((i, elem) => {
                    try {
                        const jsonData = JSON.parse($(elem).html());
                        if (jsonData.description) {
                            console.log('📝 Found caption via JSON-LD');
                            caption = jsonData.description;
                            return false;
                        }
                    } catch (e) {}
                });
            }
            
            // Method 3: Extract video URL from inline JSON - Multiple patterns
            const scriptTags = $('script').toArray();
            for (const script of scriptTags) {
                const scriptContent = $(script).html();
                if (scriptContent && !videoUrl) {
                    try {
                        // Pattern 1: video_url
                        let videoUrlMatch = scriptContent.match(/"video_url":"([^"]+)"/);
                        if (videoUrlMatch) {
                            videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                            console.log('✅ Found video URL via video_url pattern');
                            break;
                        }
                        
                        // Pattern 2: video_versions or video_resources
                        videoUrlMatch = scriptContent.match(/"video_versions":\[{"url":"([^"]+)"/);
                        if (videoUrlMatch) {
                            videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                            console.log('✅ Found video URL via video_versions pattern');
                            break;
                        }
                        
                        // Pattern 3: playback_url
                        videoUrlMatch = scriptContent.match(/"playback_url":"([^"]+)"/);
                        if (videoUrlMatch) {
                            videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                            console.log('✅ Found video URL via playback_url pattern');
                            break;
                        }
                        
                        // Pattern 4: Look for .mp4 URLs in general
                        const mp4Matches = scriptContent.match(/https:[^"]*\.mp4[^"]*/g);
                        if (mp4Matches && mp4Matches.length > 0) {
                            // Get the longest URL (usually the highest quality)
                            videoUrl = mp4Matches.reduce((longest, current) => 
                                current.length > longest.length ? current : longest
                            ).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                            console.log('✅ Found video URL via mp4 pattern search');
                            break;
                        }
                        
                        // Pattern 5: Alternative JSON structure
                        if (scriptContent.includes('shortcode_media')) {
                            const jsonMatch = scriptContent.match(/window\._sharedData\s*=\s*({.*?});/);
                            if (jsonMatch) {
                                const sharedData = JSON.parse(jsonMatch[1]);
                                const media = sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
                                if (media?.video_url) {
                                    videoUrl = media.video_url;
                                    console.log('✅ Found video URL via shortcode_media');
                                    break;
                                }
                            }
                        }
                        
                    } catch (e) {
                        // Continue to next script tag
                    }
                }
            }
            
            if (videoUrl && caption) {
                return { videoUrl, caption };
            } else if (attempt < maxRetries) {
                console.log(`⚠️ Incomplete data (video: ${!!videoUrl}, caption: ${!!caption}), retrying...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else if (attempt === maxRetries) {
                // Save debug info on final attempt
                console.log(`🔍 Saving debug info for ${shortcode}...`);
                const debugFile = path.join(REELS_FOLDER, `debug_${shortcode}.txt`);
                fs.writeFileSync(debugFile, response.data);
                console.log(`💾 Debug HTML saved to debug_${shortcode}.txt`);
            }
            
        } catch (error) {
            console.error(`❌ Scraping attempt ${attempt} failed:`, error.message);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
    
    return null;
}

async function downloadVideo(videoUrl, shortcode) {
    try {
        console.log(`⬇️ Downloading ${shortcode}...`);
        console.log(`🔗 Video URL: ${videoUrl.substring(0, 80)}...`);
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
            },
            timeout: 60000
        });
        
        const videoPath = path.join(REELS_FOLDER, `${shortcode}.mp4`);
        const writer = fs.createWriteStream(videoPath);
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            let downloadedBytes = 0;
            
            response.data.on('data', (chunk) => {
                downloadedBytes += chunk.length;
            });
            
            writer.on('finish', () => {
                const sizeKB = Math.round(downloadedBytes / 1024);
                console.log(`✅ Downloaded: ${shortcode} (${sizeKB}KB)`);
                resolve(videoPath);
            });
            
            writer.on('error', reject);
        });
        
    } catch (error) {
        console.error(`❌ Download failed for ${shortcode}:`, error.message);
        return null;
    }
}

function saveCaptionData(shortcode, caption, originalUrl) {
    try {
        const captionsFile = path.join(REELS_FOLDER, 'captions.json');
        let captions = {};
        
        // Load existing captions if file exists
        if (fs.existsSync(captionsFile)) {
            try {
                captions = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
            } catch (e) {
                console.log('⚠️ Creating new captions file');
            }
        }
        
        // Add new caption data
        captions[shortcode] = {
            caption: caption,
            originalUrl: originalUrl,
            timestamp: new Date().toISOString()
        };
        
        // Save back to file
        fs.writeFileSync(captionsFile, JSON.stringify(captions, null, 2));
        console.log(`💾 Caption saved for ${shortcode}`);
        
    } catch (error) {
        console.error(`⚠️ Error saving caption for ${shortcode}:`, error.message);
    }
}

// Read URLs from file (redefined locally)
function readReelUrls() {
    try {
        if (!fs.existsSync(REELS_FILE)) {
            console.log(`❌ File not found: ${REELS_FILE}`);
            console.log('📝 Create a reels.txt file with Instagram URLs (one per line)');
            return [];
        }
        
        const content = fs.readFileSync(REELS_FILE, 'utf8');
        const urls = content
            .split('\n')
            .map(url => url.trim())
            .filter(url => url && url.includes('instagram.com'));
        
        console.log(`📋 Found ${urls.length} Instagram URLs in ${REELS_FILE}`);
        return urls;
        
    } catch (error) {
        console.error(`❌ Error reading ${REELS_FILE}:`, error.message);
        return [];
    }
}

// Upload video to uguu.se public hosting
async function uploadToPublicHosting(videoPath, shortcode) {
    console.log(`🌐 Uploading ${shortcode} to uguu.se...`);
    
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('files[]', fs.createReadStream(videoPath), {
        filename: `${shortcode}.mp4`,
        contentType: 'video/mp4'
    });
    
    try {
        const response = await axios.post('https://uguu.se/upload.php', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
            },
            timeout: 60000
        });
        
        if (response.data && response.data.success) {
            const publicUrl = response.data.files[0].url;
            console.log(`✅ Successfully uploaded to uguu.se: ${publicUrl}`);
            return publicUrl;
        } else {
            throw new Error('Upload response indicates failure');
        }
    } catch (error) {
        console.error(`❌ uguu.se upload failed: ${error.message}`);
        return null;
    }
}

// Convert video to Instagram-compatible format
async function convertVideoForInstagram(inputPath, shortcode) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(REELS_FOLDER, `${shortcode}_converted.mp4`);
        
        console.log(`🔄 Converting ${shortcode} to Instagram format...`);
        
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .format('mp4')
            .fps(30)
            .size('1080x1920') // Instagram Reels aspect ratio
            .videoBitrate('2000k')
            .audioBitrate('128k')
            .outputOptions([
                '-profile:v high',
                '-level 4.0',
                '-pix_fmt yuv420p',
                '-preset fast',
                '-movflags +faststart'
            ])
            .on('start', (commandLine) => {
                console.log(`📹 FFmpeg command: ${commandLine}`);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    process.stdout.write(`\r🔄 Converting: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log(`\n✅ Video converted successfully: ${shortcode}_converted.mp4`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`❌ Conversion failed: ${err.message}`);
                reject(err);
            })
            .save(outputPath);
    });
}

// Remove caption data from captions.json for a specific shortcode
function removeCaptionData(shortcode) {
    try {
        const captionsFile = path.join(REELS_FOLDER, 'captions.json');
        if (fs.existsSync(captionsFile)) {
            let captions = {};
            try {
                captions = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
                if (captions[shortcode]) {
                    delete captions[shortcode];
                    fs.writeFileSync(captionsFile, JSON.stringify(captions, null, 2));
                    console.log(`🗑️ Removed caption data for ${shortcode}`);
                }
            } catch (e) {
                console.log(`⚠️ Error removing caption data for ${shortcode}:`, e.message);
            }
        }
    } catch (error) {
        console.error(`⚠️ Error accessing captions file for ${shortcode}:`, error.message);
    }
}

// Comprehensive cleanup for failed processing (removes all traces)
async function cleanupFailedProcessing(shortcode, reason = 'processing failed') {
    try {
        console.log(`🧹 Cleaning up failed processing for ${shortcode} (${reason})...`);
        
        // Clean up video files
        const originalVideoPath = path.join(REELS_FOLDER, `${shortcode}.mp4`);
        const convertedVideoPath = path.join(REELS_FOLDER, `${shortcode}_converted.mp4`);
        
        if (fs.existsSync(originalVideoPath)) {
            fs.unlinkSync(originalVideoPath);
            console.log(`🗑️ Deleted original video: ${shortcode}.mp4`);
        }
        
        if (fs.existsSync(convertedVideoPath)) {
            fs.unlinkSync(convertedVideoPath);
            console.log(`🗑️ Deleted converted video: ${shortcode}_converted.mp4`);
        }
        
        // Clean up debug files
        const debugFile = path.join(REELS_FOLDER, `debug_${shortcode}.txt`);
        if (fs.existsSync(debugFile)) {
            fs.unlinkSync(debugFile);
            console.log(`🗑️ Deleted debug file: debug_${shortcode}.txt`);
        }
        
        // Remove caption data from captions.json
        removeCaptionData(shortcode);
        
        console.log(`✅ Cleanup complete for ${shortcode}`);
    } catch (error) {
        console.error(`⚠️ Error during failed processing cleanup for ${shortcode}:`, error.message);
    }
}

// Clean up all existing files from previous runs (optional startup cleanup)
async function cleanupAllExistingFiles() {
    try {
        console.log(`🧹 Cleaning up all existing files from previous runs...`);
        
        if (!fs.existsSync(REELS_FOLDER)) {
            console.log(`📁 Reels folder doesn't exist, nothing to clean`);
            return;
        }
        
        const files = fs.readdirSync(REELS_FOLDER);
        let cleanedCount = 0;
        
        for (const file of files) {
            const filePath = path.join(REELS_FOLDER, file);
            
            // Remove video files (.mp4)
            if (file.endsWith('.mp4')) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted video file: ${file}`);
                cleanedCount++;
            }
            
            // Remove debug files (debug_*.txt)
            if (file.startsWith('debug_') && file.endsWith('.txt')) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted debug file: ${file}`);
                cleanedCount++;
            }
        }
        
        // Clear captions.json
        const captionsFile = path.join(REELS_FOLDER, 'captions.json');
        if (fs.existsSync(captionsFile)) {
            fs.writeFileSync(captionsFile, '{}');
            console.log(`🗑️ Cleared captions.json`);
            cleanedCount++;
        }
        
        console.log(`✅ Cleanup complete - removed ${cleanedCount} files/entries`);
    } catch (error) {
        console.error(`⚠️ Error during full cleanup:`, error.message);
    }
}

// Clean up downloaded files after successful Instagram upload
async function cleanupDownloadedFiles(shortcode, originalVideoPath, convertedVideoPath) {
    try {
        console.log(`🧹 Cleaning up downloaded files for ${shortcode}...`);
        
        // Delete original video file
        if (fs.existsSync(originalVideoPath)) {
            fs.unlinkSync(originalVideoPath);
            console.log(`🗑️ Deleted original video: ${path.basename(originalVideoPath)}`);
        }
        
        // Delete converted video file (if different from original)
        if (convertedVideoPath && convertedVideoPath !== originalVideoPath && fs.existsSync(convertedVideoPath)) {
            fs.unlinkSync(convertedVideoPath);
            console.log(`🗑️ Deleted converted video: ${path.basename(convertedVideoPath)}`);
        }
        
        // Delete debug files if they exist
        const debugFile = path.join(REELS_FOLDER, `debug_${shortcode}.txt`);
        if (fs.existsSync(debugFile)) {
            fs.unlinkSync(debugFile);
            console.log(`🗑️ Deleted debug file: debug_${shortcode}.txt`);
        }
        
        console.log(`✅ Cleanup complete for ${shortcode}`);
    } catch (error) {
        console.error(`⚠️ Error during cleanup for ${shortcode}:`, error.message);
    }
}

// Upload reel to Instagram using public URL
async function uploadReelWithPublicURL(publicVideoUrl, shortcode, originalCaption = 'Reposted content') {
    try {
        console.log(`📤 Uploading ${shortcode} to Instagram...`);
        console.log(`📝 Using caption: "${originalCaption.substring(0, 100)}..."`);
        console.log(`🔗 Public URL: ${publicVideoUrl}`);
        
        if (!ACCESS_TOKEN || !IG_USER_ID) {
            console.log('⚠️ ACCESS_TOKEN or MY_IG_USER_ID not provided, skipping upload');
            return null;
        }
        
        // Test URL accessibility first
        try {
            console.log(`🔍 Testing URL accessibility...`);
            const testResponse = await axios.head(publicVideoUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                }
            });
            console.log(`✅ URL accessible - Content-Type: ${testResponse.headers['content-type']}`);
            console.log(`📊 Content-Length: ${testResponse.headers['content-length']}`);
        } catch (testError) {
            console.log(`⚠️ URL test failed: ${testError.message}`);
        }
        
        // Step 1: Create media container with public video URL
        console.log(`📋 Creating media container...`);
        const createResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`,
            {
                media_type: 'REELS',
                video_url: publicVideoUrl,
                caption: originalCaption,
                access_token: ACCESS_TOKEN
            }
        );
        
        const mediaId = createResponse.data.id;
        console.log(`📝 Created media container: ${mediaId}`);
        
        // Step 2: Wait for processing
        console.log(`⏳ Waiting for video processing...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        // Step 3: Check media status
        let attempts = 0;
        const maxAttempts = 15; // Increased attempts
        let mediaReady = false;
        
        while (attempts < maxAttempts && !mediaReady) {
            try {
                const statusResponse = await axios.get(
                    `https://graph.facebook.com/v18.0/${mediaId}?fields=status_code&access_token=${ACCESS_TOKEN}`
                );
                
                const statusCode = statusResponse.data.status_code;
                console.log(`📊 Media status (attempt ${attempts + 1}): ${statusCode}`);
                
                if (statusCode === 'FINISHED') {
                    mediaReady = true;
                } else if (statusCode === 'ERROR') {
                    throw new Error('Media processing failed');
                } else {
                    // Still processing, wait more
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    attempts++;
                }
            } catch (statusError) {
                console.log(`⚠️ Status check ${attempts + 1} failed:`, statusError.message);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        if (!mediaReady) {
            console.log(`⚠️ Media processing taking longer than expected, attempting to publish...`);
        }
        
        // Step 4: Publish the media
        console.log(`📤 Publishing to Instagram...`);
        const publishResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish`,
            {
                creation_id: mediaId,
                access_token: ACCESS_TOKEN
            }
        );
        
        console.log(`🎉 Successfully published to @anime.skitz!`);
        console.log(`📱 Instagram Post ID: ${publishResponse.data.id}`);
        return publishResponse.data.id;
        
    } catch (error) {
        console.error(`❌ Error uploading ${shortcode} to Instagram:`, error.message);
        if (error.response) {
            console.error(`📄 Error response:`, JSON.stringify(error.response.data, null, 2));
            console.error(`🔢 Status code:`, error.response.status);
        }
        return null;
    }
}

// Enhanced process function with public URL upload
async function processReelWithUpload(url) {
    let shortcode = null;
    let captionSaved = false;
    
    try {
        console.log(`\n🔄 Processing: ${url}`);
        
        // Extract shortcode
        shortcode = extractShortcode(url);
        if (!shortcode) {
            console.log('❌ Could not extract shortcode, skipping...');
            return false;
        }
        
        console.log(`📝 Shortcode: ${shortcode}`);
        
        // Get video URL and caption from page
        const videoData = await getVideoDataFromPage(shortcode);
        if (!videoData || !videoData.videoUrl) {
            console.log('❌ Could not get video data, skipping...');
            await cleanupFailedProcessing(shortcode, 'failed to get video data');
            return false;
        }
        
        const { videoUrl, caption } = videoData;
        console.log(`📄 Caption: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"`);
        
        // Save caption data
        saveCaptionData(shortcode, caption, url);
        captionSaved = true;
        
        // Download video
        const videoPath = await downloadVideo(videoUrl, shortcode);
        if (!videoPath) {
            console.log('❌ Could not download video, skipping...');
            await cleanupFailedProcessing(shortcode, 'failed to download video');
            return false;
        }
        
        // Upload to Instagram with public hosting
        if (ACCESS_TOKEN && IG_USER_ID) {
            // Convert video to Instagram format first
            let videoToUpload = videoPath;
            try {
                const convertedPath = await convertVideoForInstagram(videoPath, shortcode);
                videoToUpload = convertedPath;
                console.log('✅ Video converted successfully');
            } catch (conversionError) {
                console.log(`⚠️ Video conversion failed: ${conversionError.message}`);
                console.log('📤 Trying with original video...');
                videoToUpload = videoPath;
            }
            
            // Upload to public hosting and try Instagram upload
            const publicUrl = await uploadToPublicHosting(videoToUpload, shortcode);
            if (publicUrl) {
                // Then upload to Instagram
                const instagramResult = await uploadReelWithPublicURL(publicUrl, shortcode, caption);
                if (instagramResult) {
                    console.log('🎉 Successfully uploaded to Instagram!');
                    // Clean up downloaded files after successful upload
                    await cleanupDownloadedFiles(shortcode, videoPath, videoToUpload);
                } else {
                    console.log('❌ Instagram upload failed');
                    await cleanupFailedProcessing(shortcode, 'failed to upload to Instagram');
                    return false;
                }
            } else {
                console.log('❌ Could not upload to public hosting, skipping Instagram upload...');
                await cleanupFailedProcessing(shortcode, 'failed to upload to public hosting');
                return false;
            }
        } else {
            console.log('⚠️ No Instagram API credentials, keeping files but marking as incomplete');
            // If no Instagram credentials, we still keep it as successful processing
            // since the download and conversion worked, just can't upload to Instagram
        }
        
        return true;
        
    } catch (error) {
        console.error(`💥 Error processing ${url}:`, error.message);
        if (shortcode) {
            await cleanupFailedProcessing(shortcode, 'unexpected error during processing');
        }
        return false;
    }
}

// Main function
async function main() {
    console.log('🚀 Starting Enhanced Instagram Reel Processor...');
    console.log('📤 Now with automatic Instagram uploads via public URLs!\n');
    
    // Check if user wants to clean up existing files
    const shouldCleanup = process.argv.includes('--cleanup') || process.env.CLEANUP_ON_START === 'true';
    if (shouldCleanup) {
        await cleanupAllExistingFiles();
        console.log('');
    }
    
    // Ensure reels folder exists
    if (!fs.existsSync(REELS_FOLDER)) {
        fs.mkdirSync(REELS_FOLDER, { recursive: true });
        console.log(`📁 Created reels folder: ${REELS_FOLDER}`);
    }
    
    // Read URLs from file
    const urls = readReelUrls();
    if (urls.length === 0) {
        console.log('❌ No URLs to process');
        return;
    }
    
    console.log(`📊 Processing ${urls.length} URLs...`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Process each URL
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`\n📊 Progress: ${i + 1}/${urls.length}`);
        
        const success = await processReelWithUpload(url);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
        
        // Add delay between requests
        if (i < urls.length - 1) {
            console.log('⏳ Waiting 10 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    
    console.log('\n🎉 Processing complete!');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`🧹 Successfully uploaded files have been automatically cleaned up`);
    console.log(`🗑️ Failed processing files have been automatically cleaned up`);
    console.log(`📱 Check your ${IG_USER_ID} Instagram account!`);
}

// Run the enhanced script
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = {
    uploadToPublicHosting,
    uploadReelWithPublicURL,
    processReelWithUpload,
    cleanupFailedProcessing,
    cleanupAllExistingFiles,
    removeCaptionData
}; 
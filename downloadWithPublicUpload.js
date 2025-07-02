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

// Import functions from the main script
const {
    extractShortcode,
    getVideoDataFromPage,
    downloadVideo,
    saveCaptionData
} = require('./downloadReelsFromFile.js');

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

// Upload video to temporary public hosting with multiple service fallbacks
async function uploadToPublicHosting(videoPath, shortcode) {
    console.log(`🌐 Uploading ${shortcode} to public hosting...`);
    
    // Try multiple hosting services
    const hostingServices = [
        {
            name: 'tmpfiles.org',
            url: 'https://tmpfiles.org/api/v1/upload',
            method: 'tmpfiles'
        },
        {
            name: 'transfer.sh', 
            url: 'https://transfer.sh/',
            method: 'transfer'
        },
        {
            name: 'uguu.se',
            url: 'https://uguu.se/upload.php',
            method: 'uguu'
        }
    ];
    
    for (const service of hostingServices) {
        try {
            console.log(`📤 Trying ${service.name}...`);
            const publicUrl = await uploadToService(videoPath, shortcode, service);
            if (publicUrl) {
                console.log(`✅ Successfully uploaded to ${service.name}: ${publicUrl.substring(0, 50)}...`);
                return publicUrl;
            }
        } catch (error) {
            console.log(`⚠️ ${service.name} failed: ${error.message}`);
            continue;
        }
    }
    
    console.error(`❌ All hosting services failed for ${shortcode}`);
    return null;
}

// Upload to specific hosting service
async function uploadToService(videoPath, shortcode, service) {
    const FormData = require('form-data');
    const form = new FormData();
    
    switch (service.method) {
        case 'tmpfiles':
            form.append('file', fs.createReadStream(videoPath));
            const tmpResponse = await axios.post(service.url, form, {
                headers: {
                    ...form.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                },
                timeout: 60000
            });
            
            if (tmpResponse.data && tmpResponse.data.status === 'success') {
                return tmpResponse.data.data.url;
            }
            break;
            
        case 'transfer':
            const transferResponse = await axios.put(
                `${service.url}${shortcode}.mp4`,
                fs.createReadStream(videoPath),
                {
                    headers: {
                        'Content-Type': 'video/mp4',
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                    },
                    timeout: 60000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );
            
            if (transferResponse.status === 200 && transferResponse.data) {
                const url = transferResponse.data.trim();
                if (url.startsWith('https://')) {
                    return url;
                }
            }
            break;
            
        case 'uguu':
            form.append('files[]', fs.createReadStream(videoPath), {
                filename: `${shortcode}.mp4`,
                contentType: 'video/mp4'
            });
            
            const uguuResponse = await axios.post(service.url, form, {
                headers: {
                    ...form.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
                },
                timeout: 60000
            });
            
            if (uguuResponse.data && uguuResponse.data.success) {
                return uguuResponse.data.files[0].url;
            }
            break;
    }
    
    throw new Error(`${service.name} upload failed`);
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
    try {
        console.log(`\n🔄 Processing: ${url}`);
        
        // Extract shortcode
        const shortcode = extractShortcode(url);
        if (!shortcode) {
            console.log('❌ Could not extract shortcode, skipping...');
            return false;
        }
        
        console.log(`📝 Shortcode: ${shortcode}`);
        
        // Get video URL and caption from page
        const videoData = await getVideoDataFromPage(shortcode);
        if (!videoData || !videoData.videoUrl) {
            console.log('❌ Could not get video data, skipping...');
            return false;
        }
        
        const { videoUrl, caption } = videoData;
        console.log(`📄 Caption: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"`);
        
        // Save caption data
        saveCaptionData(shortcode, caption, url);
        
        // Download video
        const videoPath = await downloadVideo(videoUrl, shortcode);
        if (!videoPath) {
            console.log('❌ Could not download video, skipping...');
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
                if (!instagramResult) {
                    console.log('⚠️ Instagram upload failed, trying alternative hosting...');
                    // Try other hosting services
                    const hostingServices = [
                        { name: 'transfer.sh', method: 'transfer' },
                        { name: 'uguu.se', method: 'uguu' }
                    ];
                    
                    for (const service of hostingServices) {
                        try {
                            console.log(`📤 Trying alternative hosting: ${service.name}...`);
                            const altUrl = await uploadToService(videoToUpload, shortcode, {
                                name: service.name,
                                url: service.name === 'transfer.sh' ? 'https://transfer.sh/' : 'https://uguu.se/upload.php',
                                method: service.method
                            });
                            
                            if (altUrl) {
                                console.log(`✅ Uploaded to ${service.name}, trying Instagram again...`);
                                const altResult = await uploadReelWithPublicURL(altUrl, shortcode, caption);
                                if (altResult) {
                                    console.log(`🎉 Success with ${service.name}!`);
                                    break;
                                }
                            }
                        } catch (altError) {
                            console.log(`⚠️ ${service.name} failed: ${altError.message}`);
                        }
                    }
                }
            } else {
                console.log('❌ Could not upload to public hosting, skipping Instagram upload...');
            }
        }
        
        return true;
        
    } catch (error) {
        console.error(`💥 Error processing ${url}:`, error.message);
        return false;
    }
}

// Main function
async function main() {
    console.log('🚀 Starting Enhanced Instagram Reel Processor...');
    console.log('📤 Now with automatic Instagram uploads via public URLs!\n');
    
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
    console.log(`📂 Downloads saved to: ${REELS_FOLDER}`);
    console.log(`📱 Check your @anime.skitz Instagram account!`);
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
    processReelWithUpload
}; 
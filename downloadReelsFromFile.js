require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// Configuration
const REELS_FILE = 'reels.txt';
const REELS_FOLDER = path.join(__dirname, 'reels');
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const IG_USER_ID = process.env.MY_IG_USER_ID || process.env.IG_USER_ID;

// Ensure reels folder exists
function ensureReelsFolder() {
    if (!fs.existsSync(REELS_FOLDER)) {
        fs.mkdirSync(REELS_FOLDER, { recursive: true });
        console.log(`📁 Created reels folder: ${REELS_FOLDER}`);
    }
}

// Extract shortcode from Instagram URL
function extractShortcode(url) {
    try {
        // Handle various Instagram URL formats
        const patterns = [
            /instagram\.com\/reel\/([^\/\?]+)/, // instagram.com/reel/ABC123/
            /instagram\.com\/p\/([^\/\?]+)/, // instagram.com/p/ABC123/
            /instagram\.com\/tv\/([^\/\?]+)/, // instagram.com/tv/ABC123/
            /instagram\.com\/reels\/([^\/\?]+)/, // instagram.com/reels/ABC123/
            /instagram\.com\/[^\/]+\/reel\/([^\/\?]+)/, // instagram.com/username/reel/ABC123/
            /instagram\.com\/[^\/]+\/p\/([^\/\?]+)/, // instagram.com/username/p/ABC123/
            /instagram\.com\/[^\/]+\/tv\/([^\/\?]+)/ // instagram.com/username/tv/ABC123/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        throw new Error('Could not extract shortcode from URL');
    } catch (error) {
        console.error(`❌ Error extracting shortcode from ${url}:`, error.message);
        return null;
    }
}

// Scrape Instagram page to get video URL and caption
async function getVideoDataFromPage(shortcode) {
    // Try multiple URL formats as fallback
    const urlsToTry = [
        `https://www.instagram.com/reel/${shortcode}/`,
        `https://www.instagram.com/p/${shortcode}/`,
        `https://www.instagram.com/tv/${shortcode}/`
    ];
    
    for (let i = 0; i < urlsToTry.length; i++) {
        const url = urlsToTry[i];
        console.log(`🔍 Scraping (attempt ${i + 1}): ${url}`);
        
        try {
            const result = await attemptScrape(url, shortcode);
            if (result && result.videoUrl) {
                return result;
            }
        } catch (error) {
            console.log(`⚠️ Attempt ${i + 1} failed: ${error.message}`);
            if (i === urlsToTry.length - 1) {
                throw error; // Re-throw on last attempt
            }
        }
        
        // Small delay between attempts
        if (i < urlsToTry.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error('All scraping attempts failed');
}

// Helper function to attempt scraping a single URL
async function attemptScrape(url, shortcode) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        });
        
        const $ = cheerio.load(response.data);
        const pageHtml = response.data;
        
        let videoUrl = null;
        let caption = '';
        
        // Try to find og:video meta tag
        const ogVideo = $('meta[property="og:video"]').attr('content');
        if (ogVideo) {
            console.log(`✅ Found video URL via og:video`);
            videoUrl = ogVideo;
        }
        
        // Try to find caption from og:description
        const ogDescription = $('meta[property="og:description"]').attr('content');
        if (ogDescription) {
            caption = ogDescription;
            console.log(`📝 Found caption via og:description`);
        }
        
        // Alternative: Try to find video URL and caption in JSON-LD script tags
        if (!videoUrl || !caption) {
            const scripts = $('script[type="application/ld+json"]');
            for (let i = 0; i < scripts.length; i++) {
                try {
                    const scriptContent = $(scripts[i]).html();
                    const jsonData = JSON.parse(scriptContent);
                    
                    if (jsonData.video && jsonData.video.contentUrl && !videoUrl) {
                        console.log(`✅ Found video URL via JSON-LD`);
                        videoUrl = jsonData.video.contentUrl;
                    }
                    
                    if (jsonData.video && jsonData.video.description && !caption) {
                        caption = jsonData.video.description;
                        console.log(`📝 Found caption via JSON-LD`);
                    }
                } catch (jsonError) {
                    // Continue to next script
                }
            }
        }
        
        // Look for video URLs in Instagram's JSON structure
        if (!videoUrl) {
            try {
                // Try to find and parse JSON data containing video information
                const jsonMatches = pageHtml.match(/"video_versions":\[\{[^\]]+\}\]/g);
                if (jsonMatches) {
                    for (const jsonMatch of jsonMatches) {
                        try {
                            // Extract the video_versions array
                            const videoVersionsMatch = jsonMatch.match(/"video_versions":(\[\{[^\]]+\}\])/);
                            if (videoVersionsMatch) {
                                const videoVersionsJson = videoVersionsMatch[1].replace(/\\\//g, '/');
                                const videoVersions = JSON.parse(videoVersionsJson);
                                
                                // Find the best quality video
                                const bestVideo = videoVersions.find(v => v.url && v.url.includes('.mp4')) || videoVersions[0];
                                if (bestVideo && bestVideo.url) {
                                    videoUrl = bestVideo.url;
                                    console.log(`✅ Found video URL via JSON parsing`);
                                    break;
                                }
                            }
                        } catch (parseError) {
                            // Continue trying other matches
                        }
                    }
                }
                
                // Fallback: try older patterns
                if (!videoUrl) {
                    const videoUrlPatterns = [
                        /"video_url":"([^"]+)"/,
                        /"playback_url":"([^"]+)"/,
                        /"src":"([^"]+\.mp4[^"]*)"/
                    ];
                    
                    for (const pattern of videoUrlPatterns) {
                        const videoMatchResult = pageHtml.match(pattern);
                        if (videoMatchResult) {
                            videoUrl = videoMatchResult[1]
                                .replace(/\\u0026/g, '&')
                                .replace(/\\u003D/g, '=')
                                .replace(/\\\//g, '/')
                                .replace(/\\/g, '');
                            
                            if (videoUrl.startsWith('http') && videoUrl.includes('.mp4')) {
                                console.log(`✅ Found video URL via fallback pattern`);
                                break;
                            } else {
                                videoUrl = null;
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`⚠️ Error parsing JSON for video URL: ${error.message}`);
            }
        }
        
        // Try to find caption in inline JavaScript/React data
        if (!caption) {
            // Look for caption in various JS patterns
            const captionPatterns = [
                /"caption":"([^"]+)"/,
                /"text":"([^"]+)"/,
                /"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]+)"/
            ];
            
            for (const pattern of captionPatterns) {
                const captionMatch = pageHtml.match(pattern);
                if (captionMatch) {
                    caption = captionMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\u0026/g, '&')
                        .replace(/\\u003C/g, '<')
                        .replace(/\\u003E/g, '>');
                    console.log(`📝 Found caption via inline JS`);
                    break;
                }
            }
        }
        
        // Fallback: Try page title as caption
        if (!caption) {
            const pageTitle = $('title').text();
            if (pageTitle && !pageTitle.includes('Instagram')) {
                caption = pageTitle;
                console.log(`📝 Using page title as caption`);
            }
        }
        
        if (!videoUrl) {
            // Debug: Log some of the page content to understand the structure
            console.log(`🔍 DEBUG: Page title: ${$('title').text()}`);
            console.log(`🔍 DEBUG: Found ${$('script').length} script tags`);
            console.log(`🔍 DEBUG: Page contains "video": ${pageHtml.includes('video')}`);
            console.log(`🔍 DEBUG: Page contains "mp4": ${pageHtml.includes('mp4')}`);
            
            // More specific search for actual video URLs
            const videoSearchPatterns = [
                // Direct MP4 URLs in quotes
                /"(https:\/\/[^"]*scontent[^"]*\.mp4[^"]*)"/gi,
                /"(https:\/\/[^"]*cdninstagram[^"]*\.mp4[^"]*)"/gi,
                /"(https:\/\/[^"]*fbcdn[^"]*\.mp4[^"]*)"/gi,
                /"(https:\/\/[^"]*\.mp4[^"]*)"/gi,
                // Single quotes
                /'(https:\/\/[^']*scontent[^']*\.mp4[^']*)'/gi,
                /'(https:\/\/[^']*cdninstagram[^']*\.mp4[^']*)'/gi,
                /'(https:\/\/[^']*\.mp4[^']*)'/gi,
                // Without quotes (more risky but sometimes needed)
                /https:\/\/scontent[^\s"']+\.mp4[^\s"']*/gi,
                /https:\/\/cdninstagram[^\s"']+\.mp4[^\s"']*/gi,
                /https:\/\/[^\s"']*fbcdn[^\s"']*\.mp4[^\s"']*/gi
            ];
            
            for (const pattern of videoSearchPatterns) {
                const matches = pageHtml.match(pattern);
                if (matches && matches.length > 0) {
                    for (const match of matches) {
                        // Clean up the URL - more comprehensive cleaning
                        let cleanUrl = match
                            .replace(/^["']|["']$/g, '') // Remove quotes
                            .replace(/\\u0026/g, '&')     // Fix encoded &
                            .replace(/\\u003D/g, '=')     // Fix encoded =
                            .replace(/\\u003F/g, '?')     // Fix encoded ?
                            .replace(/\\\//g, '/')        // Fix escaped slashes
                            .replace(/\\/g, '')           // Remove remaining escapes
                            .trim();                      // Remove whitespace
                        
                        // Much stricter validation - must be a proper video URL
                        if (cleanUrl.startsWith('https://') && 
                            cleanUrl.includes('.mp4') &&
                            !cleanUrl.includes('xml') &&
                            !cleanUrl.includes('<') &&
                            !cleanUrl.includes('>') &&
                            (cleanUrl.includes('scontent') || cleanUrl.includes('cdninstagram') || cleanUrl.includes('fbcdn')) &&
                            cleanUrl.length > 50 && cleanUrl.length < 500) {
                            
                            videoUrl = cleanUrl;
                            console.log(`✅ Found valid video URL: ${videoUrl.substring(0, 80)}...`);
                            break;
                        } else {
                            console.log(`⚠️ Rejected invalid URL: ${cleanUrl.substring(0, 50)}...`);
                        }
                    }
                    if (videoUrl) break; // Found valid URL, stop searching
                }
            }
            
            // If still no video URL, let's try to save some content for inspection
            if (!videoUrl) {
                // Look for the first script tag that contains "mp4"
                const scripts = $('script');
                for (let i = 0; i < scripts.length; i++) {
                    const scriptContent = $(scripts[i]).html();
                    if (scriptContent && scriptContent.includes('mp4')) {
                        // Save a snippet of the script for debugging
                        const debugFile = path.join(REELS_FOLDER, `debug_${shortcode}.txt`);
                        const snippet = scriptContent.substring(0, 2000); // First 2000 chars
                        require('fs').writeFileSync(debugFile, `URL: ${url}\n\nScript content (first 2000 chars):\n${snippet}`);
                        console.log(`🔍 DEBUG: Saved script snippet to ${debugFile}`);
                        break;
                    }
                }
                throw new Error('Could not find video URL in page');
            }
        }
        
        return {
            videoUrl,
            caption: caption || 'Reposted content'
        };
        
    } catch (error) {
        console.error(`❌ Error scraping URL ${url}:`, error.message);
        throw error; // Re-throw for the main function to handle
    }
}

// Download video file
async function downloadVideo(videoUrl, shortcode) {
    const filename = `${shortcode}.mp4`;
    const filepath = path.join(REELS_FOLDER, filename);
    
    try {
        console.log(`⬇️ Downloading ${shortcode}...`);
        console.log(`🔗 Video URL: ${videoUrl.substring(0, 100)}...`);
        
        // Validate URL format
        if (!videoUrl || !videoUrl.startsWith('http')) {
            throw new Error(`Invalid URL format: ${videoUrl}`);
        }
        
        // Check if file already exists
        if (fs.existsSync(filepath)) {
            console.log(`⚠️ File already exists: ${filename}`);
            return filepath;
        }
        
        const writer = fs.createWriteStream(filepath);
        
        const response = await axios({
            url: videoUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'video/mp4,video/webm,video/*,*/*;q=0.9',
                'Referer': 'https://www.instagram.com/'
            }
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                const stats = fs.statSync(filepath);
                if (stats.size === 0) {
                    reject(new Error('Downloaded file is empty'));
                    return;
                }
                
                console.log(`✅ Downloaded: ${shortcode} (${Math.round(stats.size / 1024)}KB)`);
                resolve(filepath);
            });
            
            writer.on('error', (error) => {
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                reject(error);
            });
        });
        
    } catch (error) {
        console.error(`❌ Error downloading ${shortcode}:`, error.message);
        
        // Clean up partial file
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        
        return null;
    }
}

// Upload reel via Instagram Graph API with direct file upload
async function uploadReelViaGraphAPI(videoPath, shortcode, originalCaption = 'Reposted content') {
    try {
        console.log(`📤 Uploading ${shortcode} via Graph API...`);
        console.log(`📝 Using caption: "${originalCaption}"`);
        
        if (!ACCESS_TOKEN || !IG_USER_ID) {
            console.log('⚠️ ACCESS_TOKEN or MY_IG_USER_ID not provided, skipping upload');
            return null;
        }
        
        // Check if video file exists
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found: ${videoPath}`);
        }
        
        // Step 1: Create media container with video file upload
        const FormData = require('form-data');
        const form = new FormData();
        
        // Add the video file
        form.append('source', fs.createReadStream(videoPath));
        form.append('media_type', 'REELS');
        form.append('caption', originalCaption);
        form.append('access_token', ACCESS_TOKEN);
        
        console.log(`📋 Creating media container for ${shortcode}...`);
        const createResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 120000, // 2 minutes timeout for video upload
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );
        
        const mediaId = createResponse.data.id;
        console.log(`📝 Created media container: ${mediaId}`);
        
        // Step 2: Wait for processing (Instagram needs time to process the video)
        console.log(`⏳ Waiting for video processing...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        // Step 3: Check media status
        let attempts = 0;
        const maxAttempts = 10;
        let mediaReady = false;
        
        while (attempts < maxAttempts && !mediaReady) {
            try {
                const statusResponse = await axios.get(
                    `https://graph.facebook.com/v18.0/${mediaId}?fields=status_code&access_token=${ACCESS_TOKEN}`
                );
                
                const statusCode = statusResponse.data.status_code;
                console.log(`📊 Media status: ${statusCode}`);
                
                if (statusCode === 'FINISHED') {
                    mediaReady = true;
                } else if (statusCode === 'ERROR') {
                    throw new Error('Media processing failed');
                } else {
                    // Still processing, wait more
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    attempts++;
                }
            } catch (statusError) {
                console.log(`⚠️ Status check attempt ${attempts + 1} failed:`, statusError.message);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        if (!mediaReady) {
            console.log(`⚠️ Media processing timeout, attempting to publish anyway...`);
        }
        
        // Step 4: Publish the media
        console.log(`📤 Publishing media...`);
        const publishResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish`,
            {
                creation_id: mediaId,
                access_token: ACCESS_TOKEN
            }
        );
        
        console.log(`✅ Successfully published reel: ${publishResponse.data.id}`);
        return publishResponse.data.id;
        
    } catch (error) {
        console.error(`❌ Error uploading ${shortcode} via Graph API:`, error.message);
        if (error.response) {
            console.error(`📄 Error response:`, JSON.stringify(error.response.data, null, 2));
            console.error(`🔢 Status code:`, error.response.status);
        }
        return null;
    }
}

// Read URLs from file
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

// Save caption data to JSON file
function saveCaptionData(shortcode, caption, url) {
    try {
        const captionsFile = path.join(REELS_FOLDER, 'captions.json');
        let captions = {};
        
        // Load existing captions if file exists
        if (fs.existsSync(captionsFile)) {
            const data = fs.readFileSync(captionsFile, 'utf8');
            captions = JSON.parse(data);
        }
        
        // Add new caption
        captions[shortcode] = {
            caption,
            url,
            savedAt: new Date().toISOString()
        };
        
        // Save back to file
        fs.writeFileSync(captionsFile, JSON.stringify(captions, null, 2));
        console.log(`💾 Caption saved for ${shortcode}`);
        
    } catch (error) {
        console.error(`⚠️ Could not save caption for ${shortcode}:`, error.message);
    }
}

// Process a single reel URL
async function processReelUrl(url) {
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
        
        // Optional: Upload via Graph API with original caption
        if (ACCESS_TOKEN && IG_USER_ID) {
            await uploadReelViaGraphAPI(videoPath, shortcode, caption);
        }
        
        return true;
        
    } catch (error) {
        console.error(`💥 Error processing ${url}:`, error.message);
        return false;
    }
}

// Main function
async function main() {
    console.log('🚀 Starting Instagram Reel Downloader...');
    
    // Ensure reels folder exists
    ensureReelsFolder();
    
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
        
        const success = await processReelUrl(url);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
        
        // Add delay between requests to be respectful
        if (i < urls.length - 1) {
            console.log('⏳ Waiting 3 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log('\n🎉 Processing complete!');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📂 Downloads saved to: ${REELS_FOLDER}`);
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = {
    extractShortcode,
    getVideoDataFromPage,
    attemptScrape,
    downloadVideo,
    uploadReelViaGraphAPI,
    processReelUrl,
    saveCaptionData
}; 
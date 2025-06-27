require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { IgApiClient } = require('instagram-private-api');
const { promisify } = require('util');
const ffmpeg = require('fluent-ffmpeg');

const readFileAsync = promisify(fs.readFile);
const ig = new IgApiClient();

// File to store uploaded shortcodes to prevent duplicates
const UPLOADED_REELS_FILE = 'uploaded_reels.json';
const SEEN_REELS_FILE = 'seen_reels.json';
const SESSION_FILE = 'instagram_session.json';
const REELS_FOLDER = path.join(__dirname, 'downloaded_reels');

// Configuration
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes (in milliseconds)
const MAX_REELS_TO_CHECK = 4; // Check last 10 posts for new reels

// Ensure reels folder exists
function ensureReelsFolder() {
    if (!fs.existsSync(REELS_FOLDER)) {
        fs.mkdirSync(REELS_FOLDER, { recursive: true });
        console.log(`📁 Created reels folder: ${REELS_FOLDER}`);
    }
}

// Extract cover image from video
async function extractCoverImage(videoPath, shortcode) {
    const coverImagePath = path.join(REELS_FOLDER, `cover_${shortcode}.jpg`);
    
    try {
        console.log('🖼️ Extracting cover image from video...');
        
        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .screenshots({
                    count: 1,
                    folder: REELS_FOLDER,
                    filename: `cover_${shortcode}.jpg`,
                    timemarks: ['00:00:01'] // Extract frame at 1 second
                })
                .on('end', () => {
                    console.log(`✅ Cover image extracted: ${coverImagePath}`);
                    resolve(coverImagePath);
                })
                .on('error', (error) => {
                    console.error('❌ Error extracting cover image:', error.message);
                    reject(error);
                });
        });
        
    } catch (error) {
        console.error('❌ Error in extractCoverImage:', error.message);
        throw error;
    }
}

// Load previously uploaded reels
function loadUploadedReels() {
    try {
        if (fs.existsSync(UPLOADED_REELS_FILE)) {
            const data = fs.readFileSync(UPLOADED_REELS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('No previous uploads found or error reading file');
    }
    return [];
}

// Load previously seen reels
function loadSeenReels() {
    try {
        if (fs.existsSync(SEEN_REELS_FILE)) {
            const data = fs.readFileSync(SEEN_REELS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('No previous seen reels found or error reading file');
    }
    return [];
}

// Save uploaded reel shortcode
function saveUploadedReel(shortcode) {
    const uploadedReels = loadUploadedReels();
    uploadedReels.push({
        shortcode,
        uploadedAt: new Date().toISOString()
    });
    fs.writeFileSync(UPLOADED_REELS_FILE, JSON.stringify(uploadedReels, null, 2));
}

// Save seen reel shortcode
function saveSeenReel(shortcode) {
    const seenReels = loadSeenReels();
    if (!seenReels.some(reel => reel.shortcode === shortcode)) {
        seenReels.push({
            shortcode,
            seenAt: new Date().toISOString()
        });
        fs.writeFileSync(SEEN_REELS_FILE, JSON.stringify(seenReels, null, 2));
    }
}

// Check if reel was already uploaded
function isReelAlreadyUploaded(shortcode) {
    const uploadedReels = loadUploadedReels();
    return uploadedReels.some(reel => reel.shortcode === shortcode);
}

// Check if reel was already seen
function isReelAlreadySeen(shortcode) {
    const seenReels = loadSeenReels();
    return seenReels.some(reel => reel.shortcode === shortcode);
}

// Save Instagram session to avoid frequent logins
async function saveSession() {
    try {
        const sessionData = await ig.state.serialize();
        fs.writeFileSync(SESSION_FILE, sessionData);
        console.log('💾 Session saved successfully');
    } catch (error) {
        console.log('⚠️ Could not save session:', error.message);
    }
}

// Load Instagram session if available
function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const sessionData = fs.readFileSync(SESSION_FILE, 'utf8');
            ig.state.deserialize(sessionData);
            console.log('📱 Session loaded from file');
            return true;
        }
    } catch (error) {
        console.log('⚠️ Could not load session:', error.message);
        // Delete corrupted session file
        if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
        }
    }
    return false;
}

// Smart login with session persistence to avoid frequent logins
async function loginToInstagram() {
    try {
        // First, try to load existing session
        console.log('🔄 Checking for existing session...');
        const sessionLoaded = loadSession();
        
        if (sessionLoaded) {
            // Test if the loaded session is still valid
            try {
                await ig.account.currentUser();
                console.log('✅ Existing session is valid, no login needed!');
                return true;
            } catch (sessionError) {
                console.log('⚠️ Existing session expired, logging in fresh...');
                // Clear invalid session file
                if (fs.existsSync(SESSION_FILE)) {
                    fs.unlinkSync(SESSION_FILE);
                }
            }
        }
        
        console.log('🔐 Logging in to Instagram...');
        
        // Basic login procedure as per official example
        ig.state.generateDevice(process.env.IG_USERNAME);
        
        // Optional proxy (if needed)
        // ig.state.proxyUrl = process.env.IG_PROXY;
        
        // Perform login
        const loggedInUser = await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
        
        console.log('✅ Successfully logged in to Instagram');
        console.log(`👤 Logged in as: ${loggedInUser.username}`);
        
        // Save session for future use
        await saveSession();
        
        return true;
    } catch (error) {
        console.error('❌ Failed to login to Instagram:', error.message);
        
        // Log more details about login errors
        if (error.response) {
            console.error('📄 Login error response:', error.response.body);
            console.error('🔢 Status code:', error.response.statusCode);
        }
        
        return false;
    }
}

// Get latest reels from a user (multiple reels)
async function getLatestReelsFromUser(username, maxReels = MAX_REELS_TO_CHECK) {
    try {
        console.log(`🔍 Checking for new reels from: ${username}`);
        
        // Remove @ if present and any URL parts
        const cleanUsername = username.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
        
        let user;
        try {
            // Use the working method from our test
            console.log(`👤 Searching for user: ${cleanUsername}`);
            const userInfo = await ig.user.usernameinfo(cleanUsername);
            user = userInfo; // The response is the user object directly
            
            if (!user || !user.username) {
                throw new Error('Invalid user response structure');
            }
            
        } catch (searchError) {
            console.error('❌ User search failed');
            throw new Error(`Could not find user: ${cleanUsername}`);
        }
        
        console.log(`👤 Found user: ${user.username} (ID: ${user.pk})`);
        
        const userFeed = ig.feed.user(user.pk);
        const posts = await userFeed.items();
        
        // Find all reels (media_type 2 = video with video_versions)
        const reels = posts
            .filter((post) => post.media_type === 2 && post.video_versions)
            .slice(0, maxReels) // Get only the latest N reels
            .map(reel => ({
                videoUrl: reel.video_versions[0].url,
                shortcode: reel.code,
                caption: reel.caption?.text || '',
                takenAt: reel.taken_at * 1000 // Convert to milliseconds
            }));
        
        console.log(`📱 Found ${reels.length} recent reels from ${user.username}`);
        return reels;
        
    } catch (error) {
        console.error('❌ Error getting latest reels:', error.message);
        
        // Log more details about the error
        if (error.response) {
            console.error('📄 Error response:', error.response.body);
            console.error('🔢 Status code:', error.response.statusCode);
        }
        
        throw error;
    }
}

// Download reel video
async function downloadReel(videoUrl, shortcode) {
    const filename = `reel_${shortcode}.mp4`;
    const filepath = path.join(REELS_FOLDER, filename);
    
    try {
        console.log('⬇️ Downloading reel...');
        console.log(`📍 Saving to: ${filepath}`);
        console.log(`🔗 Video URL: ${videoUrl}`);
        
        // Ensure reels folder exists
        ensureReelsFolder();
        
        // Clean up any existing file first
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            console.log('🗑️ Removed existing file');
        }
        
        const writer = fs.createWriteStream(filepath);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, 60000); // 60 second timeout
        
        try {
            const response = await axios({
                url: videoUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: 30000, // 30 second timeout for connection
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'video/mp4,video/webm,video/*,*/*;q=0.9',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'identity',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            
            clearTimeout(timeout);
            response.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', async () => {
                    // Wait a moment for file to be fully written
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Validate the downloaded file
                    if (!fs.existsSync(filepath)) {
                        reject(new Error(`Downloaded file does not exist at: ${filepath}`));
                        return;
                    }
                    
                    const stats = fs.statSync(filepath);
                    if (stats.size === 0) {
                        reject(new Error('Downloaded file is empty'));
                        return;
                    }
                    
                    if (stats.size < 1024) { // Less than 1KB is suspicious
                        reject(new Error(`Downloaded file is too small (${stats.size} bytes)`));
                        return;
                    }
                    
                    console.log(`✅ Reel downloaded successfully (${Math.round(stats.size / 1024)}KB)`);
                    console.log(`📂 File saved at: ${filepath}`);
                    
                    resolve(filepath);
                });
                
                writer.on('error', (error) => {
                    console.error('Error writing file:', error);
                    if (fs.existsSync(filepath)) {
                        fs.unlinkSync(filepath);
                    }
                    reject(error);
                });
                
                response.data.on('error', (error) => {
                    console.error('Error downloading:', error);
                    if (fs.existsSync(filepath)) {
                        fs.unlinkSync(filepath);
                    }
                    reject(error);
                });
            });
            
        } catch (axiosError) {
            clearTimeout(timeout);
            if (axiosError.code === 'ECONNABORTED') {
                throw new Error('Download timeout - video URL may be expired');
            }
            throw axiosError;
        }
        
    } catch (error) {
        console.error('❌ Error downloading reel:', error.message);
        
        // Clean up partial file if it exists
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        
        throw error;
    }
}

// Debug function to test video upload issues
async function debugVideoUpload(filepath, originalCaption = '', shortcode = '') {
    try {
        console.log('\n🔍 DEBUG: Testing video upload...');
        
        // Read and validate file
        const videoBuffer = fs.readFileSync(filepath);
        console.log(`📊 Video buffer length: ${videoBuffer.length}`);
        console.log(`📊 Video buffer type: ${typeof videoBuffer}`);
        console.log(`📊 Video buffer constructor: ${videoBuffer.constructor.name}`);
        
        // Extract cover image from the video
        let coverImageBuffer;
        let extractedCoverPath = null;
        
        try {
            // Try to extract cover image from video
            extractedCoverPath = await extractCoverImage(filepath, shortcode || Date.now().toString());
            coverImageBuffer = await readFileAsync(extractedCoverPath);
            console.log(`🖼️ Extracted cover image loaded: ${Math.round(coverImageBuffer.length / 1024)}KB`);
        } catch (extractError) {
            console.log('⚠️ Failed to extract cover from video, using fallback cover.png');
            // Fallback to static cover image
            const coverPath = path.join(__dirname, 'cover.png');
            coverImageBuffer = await readFileAsync(coverPath);
            console.log(`🖼️ Fallback cover image loaded: ${Math.round(coverImageBuffer.length / 1024)}KB`);
        }
        
        // Try a simple approach first - just check if we can create the upload
        console.log('🧪 Testing buffer validity...');
        
        // Alternative approach: Try uploading as a simple video first
        try {
            console.log('🎬 Attempting video upload with cover image...');
            const captionToUse = originalCaption || 'Reposted via bot 🤖';
            console.log(`📝 Using caption: "${captionToUse}"`);
            
            // Use the proper video upload format with required coverImage
            const result = await ig.publish.video({
                video: videoBuffer,
                coverImage: coverImageBuffer,
                caption: captionToUse
            });
            
            console.log('✅ Upload successful!', result);
            return result;
            
        } catch (uploadError) {
            console.error('❌ Upload failed with error:', uploadError.message);
            console.error('📚 Full error:', uploadError);
            
            // Try alternative approach - check if it's a reel vs regular video issue
            console.log('🔄 Trying alternative upload method...');
            
            // Some versions need different method names
            if (ig.publish.story) {
                try {
                    const storyResult = await ig.publish.story({
                        file: videoBuffer
                    });
                    console.log('✅ Story upload worked!', storyResult);
                    return storyResult;
                } catch (storyError) {
                    console.error('❌ Story upload also failed:', storyError.message);
                }
            }
            
            throw uploadError;
        }
        
    } catch (error) {
        console.error('💥 Debug function failed:', error.message);
        throw error;
    } finally {
        // Clean up extracted cover image
        if (extractedCoverPath && fs.existsSync(extractedCoverPath)) {
            fs.unlinkSync(extractedCoverPath);
            console.log('🧹 Cleaned up extracted cover image');
        }
    }
}

// Check for new reels and process them
async function checkForNewReels(targetUsername) {
    try {
        console.log(`\n🔄 [${new Date().toLocaleString()}] Checking for new reels...`);
        
        // Get latest reels from target user
        const reels = await getLatestReelsFromUser(targetUsername);
        
        // Filter for truly new reels (not seen before)
        const newReels = reels.filter(reel => !isReelAlreadySeen(reel.shortcode));
        
        if (newReels.length === 0) {
            console.log('😴 No new reels found');
            return;
        }
        
        console.log(`🆕 Found ${newReels.length} new reel(s)!`);
        
        // Mark all reels as seen (including ones we won't upload)
        reels.forEach(reel => saveSeenReel(reel.shortcode));
        
        // Process each new reel with error handling
        for (const reel of newReels) {
            try {
                console.log(`\n📝 Processing reel: ${reel.shortcode}`);
                
                // Skip if already uploaded
                if (isReelAlreadyUploaded(reel.shortcode)) {
                    console.log('⚠️ This reel was already uploaded. Skipping...');
                    continue;
                }
                
                // Process the reel with error isolation
                await processNewReelWithErrorHandling(reel);
                
                // Add a small delay between uploads to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
                
            } catch (processingError) {
                console.error(`💥 Failed to process reel ${reel.shortcode}:`, processingError.message);
                
                // Continue with next reel instead of stopping entirely
                console.log('🔄 Continuing with next reel...');
            }
        }
        
    } catch (error) {
        console.error('💥 Error checking for new reels:', error.message);
        
        // Log more details but don't crash
        if (error.response) {
            console.error('📄 Error response:', error.response.body);
        }
        
        console.log('⏳ Will retry on next check...');
    }
}

// Process reel with better error handling
async function processNewReelWithErrorHandling(reelData) {
    let filepath = null;
    
    try {
        console.log(`\n📝 Processing reel: ${reelData.shortcode}`);
        
        // Step 1: Test video URL accessibility
        console.log('🔗 Testing video URL accessibility...');
        try {
            const testResponse = await axios.head(reelData.videoUrl, { timeout: 10000 });
            console.log(`✅ Video URL is accessible (${testResponse.status})`);
        } catch (urlError) {
            throw new Error(`Video URL is not accessible: ${urlError.message}`);
        }
        
        // Step 2: Download the reel
        filepath = await downloadReel(reelData.videoUrl, reelData.shortcode);
        
        // Step 3: Use debug upload method with original caption
        console.log('🧪 Using debug upload method...');
        console.log(`📝 Original caption: "${reelData.caption}"`);
        await debugVideoUpload(filepath, reelData.caption, reelData.shortcode);
        
        // Step 4: Save shortcode to prevent duplicates
        saveUploadedReel(reelData.shortcode);
        
        console.log(`🎉 Successfully reposted reel: ${reelData.shortcode}`);
        
    } catch (error) {
        console.error(`💥 Error processing reel ${reelData.shortcode}:`, error.message);
        throw error;
    } finally {
        // Clean up downloaded file
        if (filepath && fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            console.log('🧹 Cleaned up downloaded file');
        }
    }
}

// Start real-time monitoring with error handling
async function startRealTimeMonitoring(targetUsername) {
    console.log('🚀 Starting Instagram reel monitoring bot...');
    console.log(`👀 Monitoring: ${targetUsername}`);
    console.log(`⏰ Check interval: ${CHECK_INTERVAL / 1000 / 60} minutes`);
    
    // Login to Instagram
    const loginSuccess = await loginToInstagram();
    if (!loginSuccess) {
        throw new Error('Failed to login to Instagram');
    }
    
    // Initial check
    await checkForNewReels(targetUsername);
    
    // Set up interval for continuous monitoring
    const intervalId = setInterval(async () => {
        await checkForNewReels(targetUsername);
    }, CHECK_INTERVAL);
    
    console.log('\n✨ Real-time monitoring started!');
    console.log('Press Ctrl+C to stop monitoring');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Stopping monitoring...');
        clearInterval(intervalId);
        console.log('👋 Monitoring stopped. Goodbye!');
        process.exit(0);
    });
    
    // Handle uncaught exceptions to prevent crashes from fbsearch errors
    process.on('uncaughtException', (error) => {
        if (error.message.includes('fbsearch') || error.message.includes('404 Not Found')) {
            console.log('⚠️ Instagram API background call failed (expected), continuing...');
        } else {
            console.error('💥 Unexpected error:', error.message);
            console.log('🔄 Bot will continue running...');
        }
    });
}

// Main function to repost latest reel (single run)
async function repostLatestReel(targetUsername) {
    try {
        console.log('🚀 Starting Instagram reel reposting bot...');
        
        // Step 1: Login to Instagram
        const loginSuccess = await loginToInstagram();
        if (!loginSuccess) {
            throw new Error('Failed to login to Instagram');
        }
        
        // Step 2: Get latest reels from target user
        const reels = await getLatestReelsFromUser(targetUsername, 1);
        
        if (reels.length === 0) {
            console.log('❌ No reels found for this user');
            return;
        }
        
        const latestReel = reels[0];
        
        // Step 3: Check if already uploaded
        if (isReelAlreadyUploaded(latestReel.shortcode)) {
            console.log('⚠️ This reel has already been uploaded. Skipping...');
            return;
        }
        
        // Step 4: Process the reel
        await processNewReelWithErrorHandling(latestReel);
        
        console.log('🎉 Successfully reposted the latest reel!');
        
    } catch (error) {
        console.error('💥 Error in main process:', error.message);
    }
}

// Simple upload function as backup
async function uploadReel(filepath, caption = 'Reposted via bot 🤖', shortcode = '') {
    try {
        console.log('⬆️ Uploading reel to Instagram...');
        console.log(`📂 Reading from: ${filepath}`);
        
        // Validate file exists
        if (!fs.existsSync(filepath)) {
            throw new Error(`File does not exist at: ${filepath}`);
        }
        
        // Check file size
        const stats = fs.statSync(filepath);
        if (stats.size === 0) {
            throw new Error(`File is empty: ${filepath}`);
        }
        
        if (stats.size < 1024) {
            throw new Error(`File is too small (${stats.size} bytes): ${filepath}`);
        }
        
        console.log(`📁 File size: ${Math.round(stats.size / 1024)}KB`);
        
        // Read the video file
        const videoBuffer = fs.readFileSync(filepath);
        
        // Double-check buffer is valid
        if (!videoBuffer || videoBuffer.length === 0) {
            throw new Error('Video buffer is empty or invalid');
        }
        
        console.log(`📦 Buffer size: ${Math.round(videoBuffer.length / 1024)}KB`);
        
        // Extract cover image from the video
        let coverImageBuffer;
        let extractedCoverPath = null;
        
        try {
            // Try to extract cover image from video
            extractedCoverPath = await extractCoverImage(filepath, shortcode || Date.now().toString());
            coverImageBuffer = await readFileAsync(extractedCoverPath);
            console.log(`🖼️ Extracted cover image loaded: ${Math.round(coverImageBuffer.length / 1024)}KB`);
        } catch (extractError) {
            console.log('⚠️ Failed to extract cover from video, using fallback cover.png');
            // Fallback to static cover image
            const coverPath = path.join(__dirname, 'cover.png');
            coverImageBuffer = await readFileAsync(coverPath);
            console.log(`🖼️ Fallback cover image loaded: ${Math.round(coverImageBuffer.length / 1024)}KB`);
        }
        
        // Upload with required parameters
        const publishResult = await ig.publish.video({
            video: videoBuffer,
            coverImage: coverImageBuffer,
            caption: caption
        });
        
        console.log('✅ Reel uploaded successfully');
        console.log(`📋 Upload result:`, publishResult);
        
        return publishResult;
        
    } catch (error) {
        console.error('❌ Error uploading reel:', error.message);
        
        // Log more details about the error
        if (error.response) {
            console.error('📄 Error response:', error.response.body);
            console.error('🔢 Status code:', error.response.statusCode);
        }
        
        throw error;
    }
}

// Export functions for potential external use
module.exports = {
    repostLatestReel,
    startRealTimeMonitoring,
    getLatestReelsFromUser,
    downloadReel,
    uploadReel,
    loginToInstagram,
    checkForNewReels
};

// Run the bot if this file is executed directly
if (require.main === module) {
    const targetUsername = 'ishowdailyvids'; // Change this to the target username
    
    // Choose mode:
    const REAL_TIME_MODE = true; // Set to false for single run
    
    if (REAL_TIME_MODE) {
        startRealTimeMonitoring(targetUsername);
    } else {
        repostLatestReel(targetUsername);
    }
}
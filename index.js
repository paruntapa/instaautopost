require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { IgApiClient } = require('instagram-private-api');

const ig = new IgApiClient();

// File to store uploaded shortcodes to prevent duplicates
const UPLOADED_REELS_FILE = 'uploaded_reels.json';

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

// Save uploaded reel shortcode
function saveUploadedReel(shortcode) {
    const uploadedReels = loadUploadedReels();
    uploadedReels.push({
        shortcode,
        uploadedAt: new Date().toISOString()
    });
    fs.writeFileSync(UPLOADED_REELS_FILE, JSON.stringify(uploadedReels, null, 2));
}

// Check if reel was already uploaded
function isReelAlreadyUploaded(shortcode) {
    const uploadedReels = loadUploadedReels();
    return uploadedReels.some(reel => reel.shortcode === shortcode);
}

// Login to Instagram
async function loginToInstagram() {
    try {
        ig.state.generateDevice(process.env.IG_USERNAME);
        await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
        console.log('✅ Successfully logged in to Instagram');
        return true;
    } catch (error) {
        console.error('❌ Failed to login to Instagram:', error.message);
        return false;
    }
}

// Get latest reel from a user
async function getLatestReelFromUser(username) {
    try {
        console.log(`🔍 Searching for user: ${username}`);
        
        // Remove @ if present and any URL parts
        const cleanUsername = username.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
        
        const user = await ig.user.searchExact(cleanUsername);
        console.log(`👤 Found user: ${user.username} (${user.full_name})`);
        
        const userFeed = ig.feed.user(user.pk);
        const posts = await userFeed.items();
        
        // Find the latest reel (media_type 2 = video with video_versions)
        const latestReel = posts.find((post) => post.media_type === 2 && post.video_versions);
        
        if (!latestReel) {
            throw new Error('No reel found for this user');
        }
        
        console.log(`🎬 Found latest reel with shortcode: ${latestReel.code}`);
        
        return {
            videoUrl: latestReel.video_versions[0].url,
            shortcode: latestReel.code,
            caption: latestReel.caption?.text || ''
        };
    } catch (error) {
        console.error('❌ Error getting latest reel:', error.message);
        throw error;
    }
}

// Download reel video
async function downloadReel(videoUrl, filename = 'reel.mp4') {
    try {
        console.log('⬇️ Downloading reel...');
        
        const writer = fs.createWriteStream(filename);
        const response = await axios({
            url: videoUrl,
            method: 'GET',
            responseType: 'stream'
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('✅ Reel downloaded successfully');
                resolve();
            });
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('❌ Error downloading reel:', error.message);
        throw error;
    }
}

// Upload reel to Instagram
async function uploadReel(filename = 'reel.mp4', caption = 'Reposted via bot 🤖') {
    try {
        console.log('⬆️ Uploading reel to Instagram...');
        
        const videoBuffer = fs.readFileSync(filename);
        
        await ig.publish.video({
            video: videoBuffer,
            caption: caption
        });
        
        console.log('✅ Reel uploaded successfully');
    } catch (error) {
        console.error('❌ Error uploading reel:', error.message);
        throw error;
    }
}

// Main function to repost latest reel
async function repostLatestReel(targetUsername) {
    try {
        console.log('🚀 Starting Instagram reel reposting bot...');
        
        // Step 1: Login to Instagram
        const loginSuccess = await loginToInstagram();
        if (!loginSuccess) {
            throw new Error('Failed to login to Instagram');
        }
        
        // Step 2: Get latest reel from target user
        const reelData = await getLatestReelFromUser(targetUsername);
        
        // Step 3: Check if already uploaded
        if (isReelAlreadyUploaded(reelData.shortcode)) {
            console.log('⚠️ This reel has already been uploaded. Skipping...');
            return;
        }
        
        // Step 4: Download the reel
        await downloadReel(reelData.videoUrl);
        
        // Step 5: Upload to own account
        await uploadReel('reel.mp4', 'Reposted via bot 🤖');
        
        // Step 6: Save shortcode to prevent duplicates
        saveUploadedReel(reelData.shortcode);
        
        // Step 7: Clean up downloaded file
        fs.unlinkSync('reel.mp4');
        console.log('🧹 Cleaned up downloaded file');
        
        console.log('🎉 Successfully reposted the latest reel!');
        
    } catch (error) {
        console.error('💥 Error in main process:', error.message);
        
        // Clean up file if it exists
        if (fs.existsSync('reel.mp4')) {
            fs.unlinkSync('reel.mp4');
        }
    }
}

// Export functions for potential external use
module.exports = {
    repostLatestReel,
    getLatestReelFromUser,
    downloadReel,
    uploadReel,
    loginToInstagram
};

// Run the bot if this file is executed directly
if (require.main === module) {
    const targetUsername = 'games.emily4'; // Change this to the target username
    repostLatestReel(targetUsername);
}
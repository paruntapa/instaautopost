# 🤖 Instagram Reel Auto-Uploader

An automated Node.js application that scrapes Instagram reels, downloads them, converts them to Instagram-compatible format, and automatically re-uploads them to your Instagram account using the Instagram Basic Display API.

## 🌟 Features

- 🔍 **Smart Scraping**: Automatically extracts video URLs and captions from Instagram reels
- ⬇️ **Video Download**: Downloads high-quality video files from Instagram
- 🎬 **Format Conversion**: Converts videos to Instagram-optimized format using FFmpeg
- 🌐 **Public Hosting**: Uploads videos to public hosting (uguu.se) for Instagram API access
- 📱 **Auto Upload**: Automatically uploads reels to your Instagram account
- 🧹 **Smart Cleanup**: Automatically cleans up files on success or failure
- 📊 **Progress Tracking**: Real-time progress updates and detailed logging
- 🔄 **Retry Logic**: Robust error handling with automatic retries

## 📋 Prerequisites

### Required Software
- **Node.js** (v14 or higher)
- **FFmpeg** (for video conversion)
- **Instagram Business/Creator Account**
- **Facebook Developer Account**

### Install FFmpeg

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install ffmpeg
```

#### macOS:
```bash
brew install ffmpeg
```

#### Windows:
Download from [FFmpeg.org](https://ffmpeg.org/download.html) and add to PATH

## 🚀 Installation

1. **Clone the repository**:
```bash
git clone <your-repo-url>
cd instagram-auto-uploader
```

2. **Install dependencies**:
```bash
npm install
```

3. **Create environment file**:
```bash
cp .env.example .env
```

## 🔧 Environment Setup

### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Instagram API Credentials
# Get these from Facebook Developer Console -> Instagram Basic Display
ACCESS_TOKEN=your_instagram_access_token_here
MY_IG_USER_ID=your_instagram_user_id_here

# Optional: Cleanup on startup (true/false)
CLEANUP_ON_START=false

# ========================================
# HOW TO GET THESE VALUES:
# ========================================

# ACCESS_TOKEN:
# 1. Go to https://developers.facebook.com/
# 2. Create a new app (Consumer type)
# 3. Add Instagram Basic Display product
# 4. Generate a User Access Token
# 5. Exchange for Long-Lived Token (60 days)
# 
# Example: EAAKSsxNG5ZBcBOwK1DOwXWlde0AUWZAZAwPXZBZCX6nQ7Ph2uXLEI4VqEZBkiwcA4t3AFOMGZBYmNFLCO...

# MY_IG_USER_ID:
# Get this using: curl -i -X GET "https://graph.instagram.com/me?fields=id,username&access_token={your-access-token}"
# 
# Example: 17841475417231627

# CLEANUP_ON_START:
# Set to true to automatically clean up all previous files when starting
# Can also use --cleanup flag: node downloadWithPublicUpload.js --cleanup
# 
# Values: true, false
# Default: false
```

> **📋 Quick Setup**: Run `npm run check` to verify your configuration is correct!

### 📱 Instagram API Setup

#### Step 1: Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "Create App" → "Consumer" → "Next"
3. Enter app name and email
4. Click "Create App"

#### Step 2: Add Instagram Basic Display

1. In your app dashboard, click "Add Product"
2. Find "Instagram Basic Display" and click "Set Up"
3. Click "Create New App" under Instagram Basic Display

#### Step 3: Configure Instagram Basic Display

1. **Basic Display Settings**:
   - Valid OAuth Redirect URIs: `https://localhost/`
   - Deauthorize Callback URL: `https://localhost/`
   - Data Deletion Request URL: `https://localhost/`

2. **Add Instagram Tester**:
   - Go to "Roles" → "Roles"
   - Click "Add Instagram Testers"
   - Add your Instagram account
   - Accept the invitation in your Instagram app

#### Step 4: Get Access Token

1. **Generate User Token**:
   ```
   https://api.instagram.com/oauth/authorize
     ?client_id={app-id}
     &redirect_uri=https://localhost/
     &scope=user_profile,user_media
     &response_type=code
   ```

2. **Exchange Code for Token**:
   ```bash
   curl -X POST \
     https://api.instagram.com/oauth/access_token \
     -F client_id={app-id} \
     -F client_secret={app-secret} \
     -F grant_type=authorization_code \
     -F redirect_uri=https://localhost/ \
     -F code={code-from-step-1}
   ```

3. **Get Long-Lived Token** (60 days):
   ```bash
   curl -i -X GET "https://graph.instagram.com/access_token
     ?grant_type=ig_exchange_token
     &client_secret={app-secret}
     &access_token={short-lived-token}"
   ```

#### Step 5: Get Instagram User ID

```bash
curl -i -X GET "https://graph.instagram.com/me?fields=id,username&access_token={access-token}"
```

## 📝 Usage

### 1. Prepare URLs File

Create a `reels.txt` file in the root directory with Instagram reel URLs (one per line):

```
https://www.instagram.com/reel/ABC123DEF45/
https://www.instagram.com/reel/GHI678JKL90/
https://www.instagram.com/reel/MNO123PQR45/
```

### 2. Run the Application

#### Using npm scripts (recommended):
```bash
# Check if everything is set up correctly
npm run check

# Run the application
npm start

# Run with cleanup (removes all previous files)
npm run start:clean

# Setup and check in one command
npm run setup
```

#### Direct Node.js commands:
```bash
# Basic usage
node downloadWithPublicUpload.js

# Clean start (removes all previous files)
node downloadWithPublicUpload.js --cleanup

# Environment variable cleanup
CLEANUP_ON_START=true node downloadWithPublicUpload.js

# Check setup
node check-setup.js
```

### 3. Monitor Progress

The application will:
1. 🔍 Scrape each reel for video URL and caption
2. ⬇️ Download the video file
3. 🎬 Convert to Instagram format (1080x1920, optimized settings)
4. 🌐 Upload to public hosting
5. 📱 Upload to your Instagram account
6. 🧹 Clean up temporary files

## 🏗️ How It Works

### Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Instagram     │───▶│   Video          │───▶│   Instagram API     │
│   Scraping      │    │   Processing     │    │   Upload            │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ Extract URLs    │    │ Download Video   │    │ Create Media        │
│ Extract Captions│    │ Convert Format   │    │ Container           │
│ Save Debug Info │    │ Upload to Host   │    │ Publish to Feed     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

### Core Components

#### 1. **Web Scraping Engine** (`getVideoDataFromPage`)
- **Multiple extraction methods**: Tries various patterns to find video URLs
- **Caption extraction**: Pulls captions from meta tags and JSON-LD
- **Retry logic**: 3 attempts with different user agents
- **Debug mode**: Saves HTML for troubleshooting failed attempts

#### 2. **Video Processing Pipeline** (`downloadVideo` + `convertVideoForInstagram`)
- **High-quality download**: Streams video files efficiently
- **Format optimization**: Converts to Instagram Reels specifications:
  - Resolution: 1080x1920 (9:16 aspect ratio)
  - Video codec: H.264 (libx264)
  - Audio codec: AAC
  - Frame rate: 30 FPS
  - Video bitrate: 2000k
  - Audio bitrate: 128k

#### 3. **Public Hosting Bridge** (`uploadToPublicHosting`)
- **uguu.se integration**: Uploads videos to public hosting
- **Instagram API requirement**: Instagram needs publicly accessible URLs
- **Temporary hosting**: Files are automatically cleaned up

#### 4. **Instagram API Integration** (`uploadReelWithPublicURL`)
- **Two-step process**:
  1. Create media container with video URL and caption
  2. Publish media to Instagram feed
- **Status monitoring**: Checks processing status before publishing
- **Error handling**: Comprehensive error reporting and retry logic

#### 5. **Smart Cleanup System**
- **Success cleanup**: Removes files after successful upload
- **Failure cleanup**: Removes ALL traces when any step fails
- **Startup cleanup**: Optional cleanup of previous run files
- **Selective removal**: Only removes failed processing data from captions.json

### File Structure

```
├── downloadWithPublicUpload.js  # Main application
├── reels.txt                    # Input URLs (create this)
├── .env                         # Environment variables
├── package.json                 # Dependencies
├── reels/                       # Working directory
│   ├── captions.json           # Stored caption data
│   ├── *.mp4                   # Downloaded videos (temp)
│   ├── *_converted.mp4         # Converted videos (temp)
│   └── debug_*.txt             # Debug files (temp)
└── README.md                   # This file
```

## 🛠️ Configuration Options

### Video Conversion Settings

You can modify the FFmpeg settings in the `convertVideoForInstagram` function:

```javascript
.size('1080x1920')        // Instagram Reels aspect ratio
.fps(30)                  // Frame rate
.videoBitrate('2000k')    // Video quality
.audioBitrate('128k')     // Audio quality
.outputOptions([
    '-profile:v high',
    '-level 4.0',
    '-pix_fmt yuv420p',   // Color format
    '-preset fast',       // Encoding speed
    '-movflags +faststart' // Web optimization
])
```

### Cleanup Behavior

- **Automatic cleanup on success**: ✅ Enabled by default
- **Automatic cleanup on failure**: ✅ Enabled by default
- **Startup cleanup**: ⚙️ Optional (`--cleanup` flag or `CLEANUP_ON_START=true`)

## 🔍 Troubleshooting

### Common Issues

#### 1. **FFmpeg Not Found**
```
Error: ffmpeg not found
```
**Solution**: Install FFmpeg and ensure it's in your system PATH

#### 2. **Instagram API Errors**
```
Error validating access token: Session has expired
```
**Solutions**:
- Refresh your access token (tokens expire every 60 days)
- Verify your `ACCESS_TOKEN` and `MY_IG_USER_ID` in `.env`
- Check if your Instagram account is properly connected to your Facebook app

#### 3. **Scraping Failures**
```
Could not get video data, skipping...
```
**Solutions**:
- Instagram may have changed their HTML structure
- Check `debug_*.txt` files for detailed HTML output
- Some reels may be geo-restricted or private

#### 4. **Public Hosting Failures**
```
uguu.se upload failed
```
**Solutions**:
- uguu.se may be temporarily down
- File size might be too large (uguu.se has limits)
- Network connectivity issues

### Debug Mode

Failed scraping attempts automatically save debug information:
- Check `reels/debug_[shortcode].txt` for raw HTML
- These files are automatically cleaned up on retry or success

### Logs Analysis

The application provides detailed logging:
- 🔍 Scraping attempts and methods used
- ⬇️ Download progress and file sizes
- 🎬 Video conversion progress and settings
- 🌐 Public hosting upload status
- 📱 Instagram API responses and status codes
- 🧹 Cleanup operations and file removal

## ⚠️ Important Notes

### Legal and Ethical Considerations
- **Respect copyright**: Only download content you have permission to use
- **Follow Instagram's ToS**: Ensure your usage complies with Instagram's terms
- **Rate limiting**: The app includes delays to avoid overwhelming Instagram's servers
- **Personal use**: This tool is designed for personal content management

### Technical Limitations
- **Instagram changes**: Instagram may update their structure, breaking scraping
- **API limits**: Instagram API has rate limits and quotas
- **Token expiration**: Access tokens expire every 60 days
- **Video size limits**: Large videos may fail public hosting upload

### Security Best Practices
- **Environment variables**: Never commit your `.env` file to version control
- **Token security**: Keep your access tokens secure and private
- **Regular rotation**: Refresh tokens regularly for security

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FFmpeg**: Video processing capabilities
- **Instagram Basic Display API**: Instagram integration
- **uguu.se**: Temporary file hosting service
- **Axios & Cheerio**: Web scraping and HTTP requests

---

**⚠️ Disclaimer**: This tool is for educational and personal use only. Users are responsible for ensuring their usage complies with Instagram's Terms of Service and applicable laws. The developers are not responsible for any misuse of this software. 
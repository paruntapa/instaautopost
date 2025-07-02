# Instagram Reel Downloader

## New Script: `downloadReelsFromFile.js`

This script downloads Instagram Reels by scraping web pages (no Instagram login required for downloading) and optionally uploads them via Facebook Graph API.

## Setup

### 1. Environment Variables (.env file)
Create a `.env` file with these variables:

```env
# For Facebook Graph API (optional - for uploads)
ACCESS_TOKEN=your_long_lived_facebook_access_token
MY_IG_USER_ID=your_instagram_business_user_id

# For original script (index.js)
IG_USERNAME=your_instagram_username
IG_PASSWORD=your_instagram_password
```

### 2. Dependencies
Make sure you have all required packages:
```bash
npm install dotenv axios cheerio fluent-ffmpeg
```

### 3. Create reels.txt
Create a `reels.txt` file with Instagram URLs (one per line):
```
https://www.instagram.com/reel/ABC123DEF/
https://www.instagram.com/reel/XYZ789GHI/
https://www.instagram.com/p/JKL456MNO/
```

## Usage

### Download Only
```bash
node downloadReelsFromFile.js
```

### Download + Upload (requires Graph API credentials)
Set `ACCESS_TOKEN` and `IG_USER_ID` in `.env` file, then run:
```bash
node downloadReelsFromFile.js
```

## How It Works

### 🕷️ Web Scraping Approach (No Instagram Login Required)

1. **Read URLs**: Reads Instagram URLs from `reels.txt`
2. **Extract Shortcode**: Gets the shortcode from URLs (e.g., `ABC123DEF` from `/reel/ABC123DEF/`)
3. **Scrape Page**: Visits `https://www.instagram.com/reel/{shortcode}/`
4. **Extract Video URL & Caption**: Uses cheerio to parse HTML and find:
   - Video URLs from `<meta property="og:video" content="...">`
   - Captions from `<meta property="og:description" content="...">`
   - JSON-LD script tags for both video and caption data
   - Inline JavaScript video URLs and caption text
5. **Save Caption**: Stores original captions in `reels/captions.json`
6. **Download**: Downloads the `.mp4` file to `reels/` folder
7. **Upload (Optional)**: Uploads video files directly to Facebook Graph API as reels with original captions

### 🔧 Key Features

- ✅ **No Instagram login required** for downloading
- ✅ **Caption extraction** - Captures original captions from multiple sources
- ✅ **Caption storage** - Saves captions to `reels/captions.json` for reference
- ✅ **Direct video upload** - Uploads local video files directly to Instagram via Graph API
- ✅ **Original caption upload** - Uses extracted captions when posting via Graph API
- ✅ **Multiple URL formats** supported (reel, p, tv)
- ✅ **Automatic folder creation** (`reels/` directory)
- ✅ **Duplicate detection** (skips existing files)
- ✅ **Error handling** (continues on failure)
- ✅ **Rate limiting** (3-second delays between requests)
- ✅ **Progress tracking** with detailed logs
- ✅ **Optional Graph API upload**

### 📊 Output Example

```
🚀 Starting Instagram Reel Downloader...
📁 Created reels folder: /path/to/reels
📋 Found 3 Instagram URLs in reels.txt
📊 Processing 3 URLs...

📊 Progress: 1/3
🔄 Processing: https://www.instagram.com/reel/ABC123DEF/
📝 Shortcode: ABC123DEF
🔍 Scraping: https://www.instagram.com/reel/ABC123DEF/
✅ Found video URL via og:video
📝 Found caption via og:description
📄 Caption: "Amazing trick! 😱 Follow for more #viral #fyp #trending..."
💾 Caption saved for ABC123DEF
⬇️ Downloading ABC123DEF...
✅ Downloaded: ABC123DEF (1024KB)
📤 Uploading ABC123DEF via Graph API...
📝 Using caption: "Amazing trick! 😱 Follow for more #viral #fyp #trending..."
✅ Published reel: 123456789
⏳ Waiting 3 seconds before next request...

🎉 Processing complete!
✅ Successful: 2
❌ Failed: 1
📂 Downloads saved to: /path/to/reels
```

## Differences from Original Script

| Feature | Original (`index.js`) | New (`downloadReelsFromFile.js`) |
|---------|----------------------|-----------------------------------|
| **Method** | Instagram Private API | Web Scraping |
| **Login Required** | ✅ Yes (Instagram login) | ❌ No (for downloading) |
| **Input** | Monitor user feed | URLs from file |
| **Real-time** | ✅ Continuous monitoring | ❌ One-time batch |
| **Rate Limits** | Instagram API limits | Web scraping friendly |
| **Upload Method** | Instagram Private API | Facebook Graph API |

## Caption Storage

The script automatically saves all extracted captions to `reels/captions.json` for your reference. The file structure looks like:

```json
{
  "ABC123DEF": {
    "caption": "Amazing trick! 😱 Follow for more #viral #fyp #trending #reels",
    "url": "https://www.instagram.com/reel/ABC123DEF/",
    "savedAt": "2024-01-15T10:30:00.000Z"
  },
  "XYZ789GHI": {
    "caption": "Another cool video with hashtags #fun #cool",
    "url": "https://www.instagram.com/reel/XYZ789GHI/", 
    "savedAt": "2024-01-15T10:33:00.000Z"
  }
}
```

This allows you to:
- 📝 **Review captions** before uploading
- 🔄 **Reuse captions** for manual uploads
- 📊 **Track what was downloaded** and when
- 🏷️ **Analyze hashtags** and content themes

## Troubleshooting

### Common Issues

1. **"Could not find video URL in page"**
   - Instagram may have changed their HTML structure
   - Try waiting and running again (anti-bot measures)

2. **Download fails**
   - Video URL might be expired
   - Try re-running the script

3. **Graph API upload fails**
   - Check your `ACCESS_TOKEN` and `IG_USER_ID`
   - Ensure your Facebook app has Instagram permissions
   - Video file needs to be accessible via public URL (limitation)

### Legal Notice
⚠️ **Important**: Respect Instagram's Terms of Service and copyright laws. Only download content you have permission to use. 
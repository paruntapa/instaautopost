#!/usr/bin/env node

/**
 * Instagram Auto-Uploader Setup Checker
 * Run this script to verify your system is properly configured
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Instagram Auto-Uploader Setup Checker\n');

let allGood = true;

// Check Node.js version
console.log('📦 Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion >= 14) {
    console.log(`✅ Node.js ${nodeVersion} (OK)\n`);
} else {
    console.log(`❌ Node.js ${nodeVersion} (Requires v14 or higher)\n`);
    allGood = false;
}

// Check FFmpeg
console.log('🎬 Checking FFmpeg installation...');
try {
    const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' });
    const versionLine = ffmpegVersion.split('\n')[0];
    console.log(`✅ ${versionLine}\n`);
} catch (error) {
    console.log('❌ FFmpeg not found! Please install FFmpeg and add it to your PATH\n');
    allGood = false;
}

// Check required files
console.log('📄 Checking required files...');

// Check package.json
if (fs.existsSync('package.json')) {
    console.log('✅ package.json found');
} else {
    console.log('❌ package.json not found');
    allGood = false;
}

// Check main script
if (fs.existsSync('downloadWithPublicUpload.js')) {
    console.log('✅ downloadWithPublicUpload.js found');
} else {
    console.log('❌ downloadWithPublicUpload.js not found');
    allGood = false;
}

// Check .env file
if (fs.existsSync('.env')) {
    console.log('✅ .env file found');
} else {
    console.log('⚠️  .env file not found (create from .env.example)');
    allGood = false;
}

// Check reels.txt
if (fs.existsSync('reels.txt')) {
    console.log('✅ reels.txt found');
    const urls = fs.readFileSync('reels.txt', 'utf8')
        .split('\n')
        .map(url => url.trim())
        .filter(url => url && url.includes('instagram.com'));
    console.log(`   📊 Found ${urls.length} Instagram URLs`);
} else {
    console.log('⚠️  reels.txt not found (create with Instagram reel URLs)');
}

console.log('');

// Check environment variables
console.log('🔧 Checking environment variables...');
const requiredEnvVars = ['ACCESS_TOKEN', 'MY_IG_USER_ID'];
const missingVars = [];

requiredEnvVars.forEach(varName => {
    if (process.env[varName]) {
        const value = process.env[varName];
        const maskedValue = value.length > 10 ? 
            value.substring(0, 10) + '...' + value.substring(value.length - 5) :
            '*'.repeat(value.length);
        console.log(`✅ ${varName}: ${maskedValue}`);
    } else {
        console.log(`❌ ${varName}: Not set`);
        missingVars.push(varName);
        allGood = false;
    }
});

if (missingVars.length > 0) {
    console.log(`\n⚠️  Missing environment variables: ${missingVars.join(', ')}`);
    console.log('   Add these to your .env file');
}

console.log('');

// Check node_modules
console.log('📚 Checking dependencies...');
if (fs.existsSync('node_modules')) {
    console.log('✅ node_modules directory found');
    
    // Check key dependencies
    const keyDeps = ['axios', 'cheerio', 'fluent-ffmpeg', 'form-data', 'dotenv'];
    keyDeps.forEach(dep => {
        if (fs.existsSync(`node_modules/${dep}`)) {
            console.log(`✅ ${dep} installed`);
        } else {
            console.log(`❌ ${dep} not installed`);
            allGood = false;
        }
    });
} else {
    console.log('❌ node_modules not found. Run: npm install');
    allGood = false;
}

console.log('');

// Check reels directory
console.log('📁 Checking reels directory...');
if (fs.existsSync('reels')) {
    console.log('✅ reels directory exists');
    const files = fs.readdirSync('reels');
    const videoFiles = files.filter(f => f.endsWith('.mp4'));
    const debugFiles = files.filter(f => f.startsWith('debug_'));
    
    if (videoFiles.length > 0 || debugFiles.length > 0) {
        console.log(`   📊 ${videoFiles.length} video files, ${debugFiles.length} debug files`);
        console.log('   💡 Run with --cleanup to clear previous files');
    }
} else {
    console.log('✅ reels directory will be created automatically');
}

console.log('\n' + '='.repeat(50));

if (allGood) {
    console.log('🎉 Setup looks good! You\'re ready to run:');
    console.log('   node downloadWithPublicUpload.js');
    console.log('\n💡 Tips:');
    console.log('   • Use --cleanup flag to start fresh');
    console.log('   • Check Instagram Developer Console if API fails');
    console.log('   • Access tokens expire every 60 days');
} else {
    console.log('❌ Setup issues found. Please fix the above problems.');
    console.log('\n📖 See README.md for detailed setup instructions');
}

console.log('\n🔗 Useful links:');
console.log('   • Facebook Developers: https://developers.facebook.com/');
console.log('   • FFmpeg Download: https://ffmpeg.org/download.html');
console.log('   • Instagram Basic Display: https://developers.facebook.com/docs/instagram-basic-display-api'); 
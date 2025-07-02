require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const IG_USER_ID = process.env.MY_IG_USER_ID || process.env.IG_USER_ID;

async function checkPermissions() {
    console.log('🔍 Diagnosing Facebook/Instagram API Permissions...\n');
    
    if (!ACCESS_TOKEN) {
        console.log('❌ ACCESS_TOKEN not found in .env file');
        return;
    }
    
    if (!IG_USER_ID) {
        console.log('❌ MY_IG_USER_ID not found in .env file');
        return;
    }
    
    try {
        // 1. Check access token info
        console.log('📊 Step 1: Checking Access Token Info...');
        const tokenInfo = await axios.get(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${ACCESS_TOKEN}`
        );
        console.log(`✅ Token belongs to: ${tokenInfo.data.name} (ID: ${tokenInfo.data.id})`);
        
        // 2. Check token permissions
        console.log('\n🔑 Step 2: Checking Token Permissions...');
        const permissions = await axios.get(
            `https://graph.facebook.com/v18.0/me/permissions?access_token=${ACCESS_TOKEN}`
        );
        
        const grantedPermissions = permissions.data.data
            .filter(p => p.status === 'granted')
            .map(p => p.permission);
            
        console.log('✅ Granted Permissions:');
        grantedPermissions.forEach(perm => console.log(`   - ${perm}`));
        
        // Check required permissions
        const requiredPermissions = [
            'instagram_basic',
            'instagram_content_publish',
            'pages_show_list',
            'pages_read_engagement'
        ];
        
        console.log('\n📋 Required Permissions Check:');
        const missingPermissions = [];
        requiredPermissions.forEach(perm => {
            if (grantedPermissions.includes(perm)) {
                console.log(`   ✅ ${perm}`);
            } else {
                console.log(`   ❌ ${perm} - MISSING`);
                missingPermissions.push(perm);
            }
        });
        
        // 3. Check Facebook Pages
        console.log('\n📖 Step 3: Checking Facebook Pages...');
        const pages = await axios.get(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${ACCESS_TOKEN}`
        );
        
        if (pages.data.data.length === 0) {
            console.log('❌ No Facebook Pages found');
            console.log('💡 You need a Facebook Page connected to an Instagram Business Account');
        } else {
            console.log(`✅ Found ${pages.data.data.length} Facebook Page(s):`);
            
            for (const page of pages.data.data) {
                console.log(`   📄 ${page.name} (ID: ${page.id})`);
                
                // Check if page has Instagram account
                try {
                    const igAccount = await axios.get(
                        `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${ACCESS_TOKEN}`
                    );
                    
                    if (igAccount.data.instagram_business_account) {
                        const igId = igAccount.data.instagram_business_account.id;
                        console.log(`      📱 Connected Instagram: ${igId}`);
                        
                        if (igId === IG_USER_ID) {
                            console.log(`      ✅ This matches your MY_IG_USER_ID!`);
                        } else {
                            console.log(`      ⚠️  This doesn't match your MY_IG_USER_ID (${IG_USER_ID})`);
                        }
                    } else {
                        console.log(`      ❌ No Instagram Business Account connected`);
                    }
                } catch (error) {
                    console.log(`      ❌ Error checking Instagram connection: ${error.message}`);
                }
            }
        }
        
        // 4. Generate solution
        console.log('\n🔧 Solution:');
        if (missingPermissions.length > 0) {
            console.log('❌ Missing Required Permissions!');
            console.log('\n📝 To fix this, you need to:');
            console.log('1. Go to https://developers.facebook.com/tools/explorer/');
            console.log('2. Select your app from the dropdown');
            console.log('3. Click "Generate Access Token"');
            console.log('4. Add these permissions:');
            missingPermissions.forEach(perm => console.log(`   - ${perm}`));
            console.log('5. Generate a new token and update your .env file');
        } else {
            console.log('✅ All required permissions are granted!');
            console.log('💡 The issue might be with app configuration or Instagram Business Account setup.');
        }
        
    } catch (error) {
        console.error('❌ Error checking permissions:', error.message);
        if (error.response) {
            console.error('📄 Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

checkPermissions().catch(console.error); 
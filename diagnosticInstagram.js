require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const IG_USER_ID = process.env.MY_IG_USER_ID || process.env.IG_USER_ID;

async function runComprehensiveDiagnostic() {
    console.log('🔍 COMPREHENSIVE INSTAGRAM API DIAGNOSTIC\n');
    console.log('='.repeat(50));
    
    if (!ACCESS_TOKEN) {
        console.log('❌ ACCESS_TOKEN not found in environment variables');
        return;
    }
    
    if (!IG_USER_ID) {
        console.log('❌ IG_USER_ID not found in environment variables');
        return;
    }
    
    try {
        // 1. Test token and user info
        console.log('\n📊 STEP 1: Testing Access Token & User Info');
        console.log('-'.repeat(40));
        
        const meResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${ACCESS_TOKEN}`
        );
        console.log(`✅ Token belongs to: ${meResponse.data.name} (ID: ${meResponse.data.id})`);
        
        // 2. Check token permissions
        console.log('\n📊 STEP 2: Checking Token Permissions');
        console.log('-'.repeat(40));
        
        const permissionsResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me/permissions?access_token=${ACCESS_TOKEN}`
        );
        
        const grantedPermissions = permissionsResponse.data.data
            .filter(p => p.status === 'granted')
            .map(p => p.permission);
        
        console.log('📋 Granted Permissions:');
        grantedPermissions.forEach(perm => {
            console.log(`   ✅ ${perm}`);
        });
        
        // 3. Check Facebook Pages
        console.log('\n📊 STEP 3: Checking Facebook Pages');
        console.log('-'.repeat(40));
        
        const pagesResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${ACCESS_TOKEN}`
        );
        
        if (pagesResponse.data.data.length === 0) {
            console.log('❌ No Facebook Pages found! You need a Facebook Page connected to your Instagram Business account.');
        } else {
            console.log(`📄 Found ${pagesResponse.data.data.length} Facebook Page(s):`);
            for (const page of pagesResponse.data.data) {
                console.log(`   📝 Page: ${page.name} (ID: ${page.id})`);
                
                // Check if page has Instagram account
                try {
                    const igAccountResponse = await axios.get(
                        `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${ACCESS_TOKEN}`
                    );
                    
                    if (igAccountResponse.data.instagram_business_account) {
                        const igAccount = igAccountResponse.data.instagram_business_account;
                        console.log(`   📱 Instagram Account: ${igAccount.id}`);
                        
                        if (igAccount.id === IG_USER_ID) {
                            console.log(`   ✅ MATCH! This is your target Instagram account.`);
                        } else {
                            console.log(`   ⚠️  Different from your IG_USER_ID (${IG_USER_ID})`);
                        }
                    } else {
                        console.log(`   ❌ No Instagram Business Account connected to this page`);
                    }
                } catch (error) {
                    console.log(`   ❌ Error checking Instagram account: ${error.message}`);
                }
            }
        }
        
        // 4. Test Instagram Account Info
        console.log('\n📊 STEP 4: Testing Instagram Account Info');
        console.log('-'.repeat(40));
        
        try {
            const igInfoResponse = await axios.get(
                `https://graph.facebook.com/v18.0/${IG_USER_ID}?fields=id,username,account_type,media_count&access_token=${ACCESS_TOKEN}`
            );
            
            console.log('📱 Instagram Account Details:');
            console.log(`   Username: ${igInfoResponse.data.username}`);
            console.log(`   Account Type: ${igInfoResponse.data.account_type}`);
            console.log(`   Media Count: ${igInfoResponse.data.media_count}`);
            
            if (igInfoResponse.data.account_type !== 'BUSINESS') {
                console.log('   ⚠️  WARNING: Account type is not BUSINESS. Instagram Content Publishing requires a Business account.');
            }
            
        } catch (error) {
            console.log(`❌ Error getting Instagram account info: ${error.message}`);
            if (error.response) {
                console.log(`📄 Error details: ${JSON.stringify(error.response.data, null, 2)}`);
            }
        }
        
        // 5. Test Instagram Media Creation Permission
        console.log('\n📊 STEP 5: Testing Instagram Media Creation Permission');
        console.log('-'.repeat(40));
        
        try {
            // Try to create a test media container (without publishing)
            const testResponse = await axios.post(
                `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`,
                {
                    image_url: 'https://via.placeholder.com/600x600.png?text=Test',
                    caption: 'Test caption - not published',
                    access_token: ACCESS_TOKEN
                }
            );
            
            console.log(`✅ Successfully created test media container: ${testResponse.data.id}`);
            console.log('   (This was not published, just testing permissions)');
            
        } catch (error) {
            console.log(`❌ Error creating media container: ${error.message}`);
            if (error.response) {
                console.log(`📄 Error details: ${JSON.stringify(error.response.data, null, 2)}`);
            }
        }
        
        // 6. Check App Information
        console.log('\n📊 STEP 6: App Information Check');
        console.log('-'.repeat(40));
        
        try {
            const appResponse = await axios.get(
                `https://graph.facebook.com/v18.0/app?access_token=${ACCESS_TOKEN}`
            );
            
            console.log('📱 App Details:');
            console.log(`   App Name: ${appResponse.data.name}`);
            console.log(`   App ID: ${appResponse.data.id}`);
            console.log(`   Category: ${appResponse.data.category}`);
            
        } catch (error) {
            console.log(`❌ Error getting app info: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('🎯 DIAGNOSIS COMPLETE');
        console.log('='.repeat(50));
        
        console.log('\n💡 COMMON SOLUTIONS:');
        console.log('1. Ensure your Instagram account is set to Business type');
        console.log('2. Verify Instagram Business account is connected to a Facebook Page');
        console.log('3. Check if your app needs Business Verification');
        console.log('4. Ensure you\'re using the correct Instagram Business Account ID');
        console.log('5. Try regenerating the access token');
        
    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
        if (error.response) {
            console.error('📄 Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

runComprehensiveDiagnostic().catch(console.error); 
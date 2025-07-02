require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const IG_USER_ID = process.env.MY_IG_USER_ID || process.env.IG_USER_ID;

async function testGraphAPICredentials() {
    console.log('🔍 Testing Graph API Credentials...\n');
    
    // Check if credentials are provided
    if (!ACCESS_TOKEN) {
        console.log('❌ ACCESS_TOKEN not found in .env file');
        return;
    }
    
    if (!IG_USER_ID) {
        console.log('❌ MY_IG_USER_ID not found in .env file');
        return;
    }
    
    console.log(`🔑 ACCESS_TOKEN: ${ACCESS_TOKEN.substring(0, 20)}...`);
    console.log(`📱 MY_IG_USER_ID: ${IG_USER_ID}\n`);
    
    try {
        // Test 1: Validate Access Token
        console.log('🧪 Test 1: Validating Access Token...');
        const tokenResponse = await axios.get(
            `https://graph.facebook.com/me?access_token=${ACCESS_TOKEN}`
        );
        console.log(`✅ Token is valid for: ${tokenResponse.data.name} (ID: ${tokenResponse.data.id})`);
        
        // Test 2: Check Instagram Business Account
        console.log('\n🧪 Test 2: Checking Instagram Business Account...');
        const igAccountResponse = await axios.get(
            `https://graph.facebook.com/v18.0/${IG_USER_ID}?fields=id,username&access_token=${ACCESS_TOKEN}`
        );
        console.log(`✅ Instagram Account: @${igAccountResponse.data.username}`);
        console.log(`📱 Instagram Account ID: ${igAccountResponse.data.id}`);
        
        // Test 3: Check Media Creation Permissions
        console.log('\n🧪 Test 3: Testing Media Creation Permissions...');
        try {
            // Try to create a test media container (without actual media)
            const testResponse = await axios.post(
                `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`,
                {
                    media_type: 'REELS',
                    caption: 'Test caption',
                    access_token: ACCESS_TOKEN
                }
            );
            console.log('❌ This should have failed - we need to provide media');
        } catch (mediaError) {
            if (mediaError.response && mediaError.response.data) {
                const error = mediaError.response.data.error;
                if (error.message.includes('media') || error.message.includes('source')) {
                    console.log('✅ Media creation endpoint is accessible (expected error about missing media)');
                } else if (error.code === 100 && error.error_subcode === 33) {
                    console.log('❌ Instagram Business Account ID is invalid or you don\'t have permissions');
                    console.log('💡 Make sure:');
                    console.log('   - You\'re using an Instagram BUSINESS account (not personal)');
                    console.log('   - The account is connected to a Facebook Page');
                    console.log('   - Your Facebook App has instagram_basic permission');
                    console.log('   - The MY_IG_USER_ID is correct');
                } else {
                    console.log(`❌ Unexpected error: ${error.message}`);
                }
            }
        }
        
        // Test 4: List Facebook Pages (to find correct IDs)
        console.log('\n🧪 Test 4: Listing your Facebook Pages...');
        try {
            const pagesResponse = await axios.get(
                `https://graph.facebook.com/me/accounts?access_token=${ACCESS_TOKEN}`
            );
            
            if (pagesResponse.data.data.length > 0) {
                console.log('📄 Your Facebook Pages:');
                for (const page of pagesResponse.data.data) {
                    console.log(`   - ${page.name} (ID: ${page.id})`);
                    
                    // Check for connected Instagram account
                    try {
                        const igResponse = await axios.get(
                            `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${ACCESS_TOKEN}`
                        );
                        
                        if (igResponse.data.instagram_business_account) {
                            const igId = igResponse.data.instagram_business_account.id;
                            console.log(`     📱 Connected Instagram Business Account ID: ${igId}`);
                            
                            if (igId === IG_USER_ID) {
                                console.log('     ✅ This matches your MY_IG_USER_ID!');
                            } else {
                                console.log('     ⚠️ This doesn\'t match your MY_IG_USER_ID');
                                console.log(`     💡 Try using: MY_IG_USER_ID=${igId}`);
                            }
                        }
                    } catch (igError) {
                        console.log('     📱 No Instagram Business Account connected');
                    }
                }
            } else {
                console.log('❌ No Facebook Pages found');
                console.log('💡 You need a Facebook Page connected to an Instagram Business Account');
            }
        } catch (pagesError) {
            console.log('❌ Could not list Facebook Pages');
        }
        
    } catch (error) {
        console.error('❌ Error testing credentials:', error.message);
        if (error.response) {
            console.error('📄 Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the test
testGraphAPICredentials().catch(console.error); 
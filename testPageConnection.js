require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function testPageConnection() {
    console.log('📄 FACEBOOK PAGE CONNECTION TEST\n');
    console.log('='.repeat(50));
    
    if (!ACCESS_TOKEN) {
        console.log('❌ ACCESS_TOKEN not found in environment variables');
        return;
    }
    
    try {
        // 1. Check what type of token this is
        console.log('🔍 Step 1: Checking Token Type');
        console.log('-'.repeat(30));
        
        const meResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${ACCESS_TOKEN}`
        );
        console.log(`📝 Token belongs to: ${meResponse.data.name} (ID: ${meResponse.data.id})`);
        
        // 2. Check Facebook Pages
        console.log('\n🔍 Step 2: Looking for Facebook Pages');
        console.log('-'.repeat(30));
        
        const pagesResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${ACCESS_TOKEN}`
        );
        
        if (pagesResponse.data.data.length === 0) {
            console.log('❌ NO FACEBOOK PAGES FOUND');
            console.log('\n📋 REQUIRED ACTIONS:');
            console.log('1. Go to https://business.facebook.com/');
            console.log('2. Create a Facebook Page (or use existing one)');
            console.log('3. Connect your Instagram Business account to the Page');
            console.log('4. Generate a PAGE ACCESS TOKEN (not user token)');
            console.log('\n📚 Detailed Steps:');
            console.log('• Go to Facebook Business Manager');
            console.log('• Add your Instagram account: Settings → Instagram accounts');
            console.log('• Link Instagram to your Facebook Page');
            console.log('• Get Page Access Token from Graph API Explorer');
            return;
        }
        
        console.log(`✅ Found ${pagesResponse.data.data.length} Facebook Page(s):`);
        
        // 3. Check each page for Instagram connection
        for (const page of pagesResponse.data.data) {
            console.log(`\n📄 Page: ${page.name} (ID: ${page.id})`);
            console.log(`   Category: ${page.category || 'Not specified'}`);
            console.log(`   Access Token: ${page.access_token ? 'Available' : 'Not available'}`);
            
            // Check Instagram connection
            try {
                const pageAccessToken = page.access_token;
                if (!pageAccessToken) {
                    console.log('   ❌ No page access token available');
                    continue;
                }
                
                const igAccountResponse = await axios.get(
                    `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`
                );
                
                if (igAccountResponse.data.instagram_business_account) {
                    const igAccount = igAccountResponse.data.instagram_business_account;
                    console.log(`   📱 Instagram Account ID: ${igAccount.id}`);
                    
                    // Get Instagram account details
                    try {
                        const igDetailsResponse = await axios.get(
                            `https://graph.facebook.com/v18.0/${igAccount.id}?fields=id,username,account_type,media_count&access_token=${pageAccessToken}`
                        );
                        
                        console.log(`   📝 Instagram Username: @${igDetailsResponse.data.username}`);
                        console.log(`   📊 Account Type: ${igDetailsResponse.data.account_type}`);
                        console.log(`   📈 Media Count: ${igDetailsResponse.data.media_count}`);
                        
                        if (igDetailsResponse.data.username === 'anime.skitz') {
                            console.log('   🎯 THIS IS YOUR TARGET ACCOUNT!');
                            console.log('\n✅ SOLUTION FOUND:');
                            console.log(`   Update your .env file with:`);
                            console.log(`   ACCESS_TOKEN=${pageAccessToken}`);
                            console.log(`   MY_IG_USER_ID=${igAccount.id}`);
                            
                            // Test media creation with this token
                            console.log('\n🧪 Testing media creation...');
                            try {
                                const testMediaResponse = await axios.post(
                                    `https://graph.facebook.com/v18.0/${igAccount.id}/media`,
                                    {
                                        image_url: 'https://via.placeholder.com/600x600.png?text=Test',
                                        caption: 'Test - not published',
                                        access_token: pageAccessToken
                                    }
                                );
                                console.log(`   ✅ Media creation test SUCCESSFUL! Container ID: ${testMediaResponse.data.id}`);
                                console.log('   🎉 Your setup is now ready for Instagram uploads!');
                            } catch (testError) {
                                console.log(`   ❌ Media creation test failed: ${testError.message}`);
                                if (testError.response) {
                                    console.log(`   📄 Error: ${JSON.stringify(testError.response.data, null, 4)}`);
                                }
                            }
                        }
                        
                    } catch (igError) {
                        console.log(`   ❌ Error getting Instagram details: ${igError.message}`);
                    }
                    
                } else {
                    console.log('   ❌ No Instagram Business Account connected to this page');
                }
                
            } catch (error) {
                console.log(`   ❌ Error checking page: ${error.message}`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('📋 NEXT STEPS IF NO MATCH FOUND:');
        console.log('1. Connect your @anime.skitz Instagram to one of the Facebook Pages above');
        console.log('2. Or create a new Facebook Page and connect your Instagram');
        console.log('3. Use the Page Access Token instead of User Access Token');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('📄 Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testPageConnection().catch(console.error); 
require('dotenv').config();
const axios = require('axios');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function findInstagramBusinessID() {
    console.log('🔍 Finding your Instagram Business Account ID...\n');
    
    if (!ACCESS_TOKEN) {
        console.log('❌ ACCESS_TOKEN not found in .env file');
        return;
    }
    
    try {
        // Get all Facebook Pages
        const pagesResponse = await axios.get(
            `https://graph.facebook.com/me/accounts?access_token=${ACCESS_TOKEN}`
        );
        
        console.log('📄 Your Facebook Pages:\n');
        
        for (const page of pagesResponse.data.data) {
            console.log(`📄 Page: ${page.name}`);
            console.log(`   📋 Page ID: ${page.id}`);
            
            try {
                // Check if this page has a connected Instagram Business Account
                const igResponse = await axios.get(
                    `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${ACCESS_TOKEN}`
                );
                
                if (igResponse.data.instagram_business_account) {
                    const igId = igResponse.data.instagram_business_account.id;
                    console.log(`   📱 Instagram Business Account ID: ${igId}`);
                    
                    // Get Instagram account details
                    try {
                        const igDetailsResponse = await axios.get(
                            `https://graph.facebook.com/v18.0/${igId}?fields=id,username,account_type&access_token=${ACCESS_TOKEN}`
                        );
                        
                        console.log(`   👤 Instagram Username: @${igDetailsResponse.data.username}`);
                        console.log(`   📊 Account Type: ${igDetailsResponse.data.account_type}`);
                        console.log(`   ✅ Use this ID: MY_IG_USER_ID=${igId}\n`);
                        
                    } catch (detailError) {
                        console.log(`   ⚠️ Could not get Instagram details\n`);
                    }
                } else {
                    console.log(`   📱 No Instagram Business Account connected\n`);
                }
                
            } catch (igError) {
                console.log(`   ❌ Error checking Instagram connection\n`);
            }
        }
        
        console.log('💡 To fix the upload issue:');
        console.log('1. Copy the Instagram Business Account ID from above');
        console.log('2. Update your .env file: MY_IG_USER_ID=your_instagram_id');
        console.log('3. Run the script again');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('📄 Details:', error.response.data);
        }
    }
}

findInstagramBusinessID().catch(console.error); 
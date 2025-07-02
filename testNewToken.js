require('dotenv').config();
const axios = require('axios');

// You can temporarily replace this with your new token for testing
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function testNewToken() {
    console.log('🧪 Testing New Access Token...\n');
    
    if (!ACCESS_TOKEN) {
        console.log('❌ Please update ACCESS_TOKEN in .env file');
        return;
    }
    
    try {
        // Test basic access
        console.log('📊 Step 1: Testing basic access...');
        const meResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${ACCESS_TOKEN}`
        );
        console.log(`✅ Success! Token belongs to: ${meResponse.data.name}`);
        
        // Test permissions
        console.log('\n📊 Step 2: Checking permissions...');
        const permissionsResponse = await axios.get(
            `https://graph.facebook.com/v18.0/me/permissions?access_token=${ACCESS_TOKEN}`
        );
        
        const grantedPermissions = permissionsResponse.data.data
            .filter(p => p.status === 'granted')
            .map(p => p.permission);
            
        const requiredPermissions = [
            'instagram_basic',
            'instagram_content_publish',
            'pages_show_list',
            'pages_read_engagement'
        ];
        
        console.log('📋 Permission Check:');
        let allGood = true;
        requiredPermissions.forEach(perm => {
            if (grantedPermissions.includes(perm)) {
                console.log(`   ✅ ${perm}`);
            } else {
                console.log(`   ❌ ${perm} - MISSING`);
                allGood = false;
            }
        });
        
        if (allGood) {
            console.log('\n🎉 NEW TOKEN IS READY! You can now try uploading to Instagram!');
        } else {
            console.log('\n⚠️  Please regenerate the token with missing permissions');
        }
        
    } catch (error) {
        console.error('❌ Token test failed:', error.message);
        if (error.response) {
            console.error('📄 Error details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

console.log('📝 Instructions:');
console.log('1. Go to https://developers.facebook.com/tools/explorer/');
console.log('2. Select YOUR app (not Graph API Explorer)');
console.log('3. Generate token with these permissions:');
console.log('   - instagram_basic');
console.log('   - instagram_content_publish'); 
console.log('   - pages_show_list');
console.log('   - pages_read_engagement');
console.log('4. Update ACCESS_TOKEN in .env file');
console.log('5. Run this script again');
console.log('\n' + '='.repeat(50) + '\n');

testNewToken().catch(console.error); 
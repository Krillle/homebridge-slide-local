// test-slide.js
const { SlideClient } = require('./slide-client');

async function main() {
  const host = '192.168.4.96';      // deine Slide-IP
  const code = 'rWU7G45S';          // dein 8-stelliger Slide-Code
  const username = 'user';          // meist "user"

  const client = new SlideClient(host, {
    timeout: 5000,
    username,
    password: code,
  });

  console.log('Testing Slide.GetInfo...');
  const info = await client.getInfo();
  console.log('Info:', info);

  console.log('Opening (pos=0)...');
  await client.setPosition(0.0);

  setTimeout(async () => {
    console.log('Closing (pos=1)...');
    await client.setPosition(1.0);
  }, 5000);
}

main().catch((err) => {
  console.error('Error:', err);
});

// Quick test to validate Safari detection logic
const testChromeOniOS = () => {
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/94.0.4606.76 Mobile/15E148 Safari/604.1';
  
  // First check: exclude Chrome-based browsers on iOS/mobile
  if (/CriOS|FxiOS|OPiOS|mercury/i.test(userAgent)) {
    console.log('✅ Chrome on iOS correctly excluded by CriOS check');
    return false;
  }
  
  // Safari detection: Safari string present, but exclude Chrome and Android
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  console.log('❌ Should not reach Safari detection for Chrome on iOS, but got:', isSafari);
  return isSafari;
};

console.log('Testing Safari detection logic:');
console.log('Chrome on iOS result:', testChromeOniOS());

const testRealSafari = () => {
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
  
  // First check: exclude Chrome-based browsers on iOS/mobile
  if (/CriOS|FxiOS|OPiOS|mercury/i.test(userAgent)) {
    console.log('❌ Real Safari incorrectly excluded');
    return false;
  }
  
  // Safari detection: Safari string present, but exclude Chrome and Android
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  console.log('✅ Real Safari correctly detected:', isSafari);
  return isSafari;
};

console.log('Real Safari result:', testRealSafari());
const fs = require('fs');
const path = require('path');

const PIPES_DIR = __dirname;

let indexHtml = fs.readFileSync(path.join(PIPES_DIR, 'index.html'), 'utf-8');
const audioJs = fs.readFileSync(path.join(PIPES_DIR, 'js', 'audio.js'), 'utf-8');
const leaderboardJs = fs.readFileSync(path.join(PIPES_DIR, 'js', 'leaderboard.js'), 'utf-8');
const authJs = fs.readFileSync(path.join(PIPES_DIR, '..', '..', 'js', 'auth.js'), 'utf-8');
const pipesHtml = fs.readFileSync(path.join(PIPES_DIR, 'pipes.html'), 'utf-8');

// 1. Inline audio.js and leaderboard.js
indexHtml = indexHtml.replace(
  '<script src="../../js/auth.js"></script>\n<script src="js/audio.js"></script>\n<script src="js/leaderboard.js"></script>',
  `<script>\n${authJs}\n${audioJs}\n${leaderboardJs}\n</script>`
);

// 2. Replace Google Fonts <link> tags with UUID-based @font-face
const fontFaceCSS = `<style>/* arabic */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("954af705-9177-41cf-aa57-22f3e72749e7") format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("5951c63b-2b5a-4522-a1e9-c851bc842bbd") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("1f23628a-3e37-420f-93ad-9dc644e3e8a9") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* hebrew */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("0d2b11ee-2950-402e-92db-a9ee59bc7873") format('woff2');
  unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}
/* latin-ext */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("d8f7563c-dfea-4c61-af9b-36743f277793") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("91c9d500-3723-4bbd-81e3-fcfac278574e") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* arabic */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("954af705-9177-41cf-aa57-22f3e72749e7") format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("5951c63b-2b5a-4522-a1e9-c851bc842bbd") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("1f23628a-3e37-420f-93ad-9dc644e3e8a9") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* hebrew */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("0d2b11ee-2950-402e-92db-a9ee59bc7873") format('woff2');
  unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}
/* latin-ext */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("d8f7563c-dfea-4c61-af9b-36743f277793") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("91c9d500-3723-4bbd-81e3-fcfac278574e") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* arabic */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("954af705-9177-41cf-aa57-22f3e72749e7") format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("5951c63b-2b5a-4522-a1e9-c851bc842bbd") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("1f23628a-3e37-420f-93ad-9dc644e3e8a9") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* hebrew */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("0d2b11ee-2950-402e-92db-a9ee59bc7873") format('woff2');
  unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}
/* latin-ext */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("d8f7563c-dfea-4c61-af9b-36743f277793") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Rubik';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("91c9d500-3723-4bbd-81e3-fcfac278574e") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
</style>`;

// Remove Google Fonts links and add @font-face
indexHtml = indexHtml.replace(
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*\n\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*\n\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/,
  fontFaceCSS
);

// 3. Add hasTWEAK CSS before closing </style> of the main style block
const tweakCSS = `
  #tweak-toggle {
    display: none;
  }
  #tweak-backdrop {
    display: none;
  }
  body.has-tweak #tweak-toggle {
    display: flex;
    position: fixed; bottom: 16px; right: 16px; z-index: 200;
    width: 48px; height: 48px;
    border-radius: 50%; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(20,22,30,0.9); color: #fff;
    font-size: 24px; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }
  #tweak-backdrop.show {
    display: block;
    position: fixed; inset: 0; z-index: 150;
    background: rgba(0,0,0,0.5);
  }
  #tweaks.show {
    display: block !important;
    position: fixed !important;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 250;
    max-height: 80vh;
    width: min(340px, 90vw);
  }`;

// Insert hasTWEAK CSS before .hint closing brace in tweaks styles
indexHtml = indexHtml.replace(
  '  .hint {\n    color: #6e7486; font-size: 10px; margin-top: 8px;\n    text-align: center; letter-spacing: 0.04em;\n  }\n</style>',
  '  .hint {\n    color: #6e7486; font-size: 10px; margin-top: 8px;\n    text-align: center; letter-spacing: 0.04em;\n  }\n' + tweakCSS + '\n</style>'
);

// 4. Add hasTWEAK JS code - insert before the edit mode message handler
const tweakJS = `
(function() {
  var params = new URLSearchParams(window.location.search);
  if (params.has('gravity')) tweaks.gravity = parseFloat(params.get('gravity'));
  if (params.has('flap')) tweaks.flap = parseFloat(params.get('flap'));
  if (params.has('speed')) tweaks.baseSpeed = parseFloat(params.get('speed'));
  if (params.has('gap')) tweaks.gapSize = parseInt(params.get('gap'));
  if (params.has('tier')) tweaks.startTier = parseInt(params.get('tier'));
  if (params.has('hitboxes')) tweaks.showHitboxes = params.get('hitboxes') === '1';
  if (params.has('hasTWEAK')) {
    document.addEventListener('DOMContentLoaded', function() {
      var btn = document.createElement('button');
      btn.id = 'tweak-toggle';
      btn.textContent = '\\u2699';
      btn.title = 'Tweaks';
      document.body.appendChild(btn);
      document.body.classList.add('has-tweak');
      var panel = document.getElementById('tweaks');
      var backdrop = document.createElement('div');
      backdrop.id = 'tweak-backdrop';
      document.body.appendChild(backdrop);
      btn.addEventListener('click', function() {
        var open = panel.classList.toggle('show');
        backdrop.classList.toggle('show', open);
      });
      backdrop.addEventListener('click', function() {
        panel.classList.remove('show');
        backdrop.classList.remove('show');
      });
    });
  }
})();

`;

indexHtml = indexHtml.replace(
  "window.addEventListener('message', (e) => {",
  tweakJS + "window.addEventListener('message', (e) => {"
);

// 5. Remove the <audio> tag for bgmAudio (not needed in bundle since there's no BGM file)
// Actually keep it - the bundler will handle asset references. The audio element is referenced by JS.
// But in the bundle, there's no assets/bgm.mp3 file, so let's keep the element but it won't play.

// 6. Escape </script> inside the template (required for JSON embedding)
// The JSON.stringify will handle this, but we also need to make sure no literal </script> appears
// in the inlined JS that would break the JSON parsing.

// 7. JSON encode the template and replace in pipes.html
// Must escape </script> inside the JSON so the browser's HTML parser doesn't close the outer script tag.
// JSON.stringify produces \" for quotes and \n for newlines, but does NOT escape </
// We need to turn </script> into <\/script> inside the JSON string.
let templateJson = JSON.stringify(indexHtml);
// Replace all occurrences of </ with <\/ to prevent HTML parser from closing script tags
templateJson = templateJson.replace(/<\//g, '<\\/');

// Find and replace the __bundler/template content
const templateRegex = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;
const match = pipesHtml.match(templateRegex);
if (!match) {
  console.error('Could not find __bundler/template in pipes.html');
  process.exit(1);
}

const newPipesHtml = pipesHtml.replace(templateRegex, `$1${templateJson}$3`);

fs.writeFileSync(path.join(PIPES_DIR, 'pipes.html'), newPipesHtml, 'utf-8');
console.log('Bundle built successfully!');
console.log('Template size:', templateJson.length, 'chars');

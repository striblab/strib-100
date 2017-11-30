/**
 * Download existing logos into project
 */

const path = require('path');
const fs = require('fs-extra');
const fetch = require('node-fetch');

// Load current data
let companies = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'assets', 'non-profit-100.json'),
    'utf-8'
  )
);

// Make sure directories for output is there
const buildPath = path.join(__dirname, '..', 'build', 'logos');
fs.mkdirsSync(buildPath);
const assetPath = path.join(__dirname, '..', '..', 'assets', 'logos');
fs.mkdirsSync(assetPath);

// Get logos
let fetches = [];
companies.forEach(c => {
  let url =
    'http://apps.startribune.com/top_100_nonprofits/np100Logos/' +
    c.coid +
    '.gif';

  let f = fetch(url).then(function(response) {
    if (response.ok && response.status < 300) {
      let dest = fs.createWriteStream(path.join(buildPath, c.coid + '.gif'));
      response.body.pipe(dest);
    }
    else {
      console.error('Unable to find image for:', c.coid, c.company);
    }
  });

  fetches.push(f);
});

// When all done
Promise.all(fetches)
  .then(() => {
    console.error('Done.');
  })
  .catch(error => {
    console.error(error);
    throw new Error(error);
  });

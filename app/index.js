/**
 * Main JS file for project.
 */

// Define globals that are added through the config.json file, here like this:
// /* global _ */
'use strict';

// Dependencies
import utilsFn from './utils.js';
import Page from './components/page.svelte.html';
// Load files here since managing paths to data from within
// the CMS has not been figured yet (or at least in a
// sustainable way)
import companies from '../assets/non-profit-100.json';

// Setup utils function
let u = utilsFn({});

// Set up page
const page = new Page({
  target: document.querySelector('#np-app-container'),
  data: {
    companies: companies,
    loading: false,
    utils: u
  }
});

// Load company data
// fetch('./assets/non-profit-100.json')
//   .then(response => {
//     return response.json();
//   })
//   .then(companies => {
//     page.set({
//       companies: companies,
//       loading: false
//     });
//   })
//   .catch(error => {
//     console.error(error);
//     page.set({ loading: false, errorLoading: true });
//   });

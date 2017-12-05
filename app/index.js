/**
 * Main JS file for project.
 */

// Define globals that are added through the config.json file, here like this:
/* global _ */
'use strict';

// Dependencies
import utilsFn from './utils.js';
import Page from './components/page.svelte.html';
// Load files here since managing paths to data from within
// the CMS has not been figured yet (or at least in a
// sustainable way)
import companies from '../assets/non-profit-100.json';
console.log(companies);

// Setup utils function
let u = utilsFn({});

// OUr current year
let publishYear = 2017;

// Set up page
const page = new Page({
  target: document.querySelector('#np-app-container'),
  data: {
    originalCompanies: companies,
    companies: _.cloneDeep(companies),
    // There is a serious issue (in FF) where using an actual .sort is
    // super slow.  Tried to debug, and the likely culprit is another
    // script on the page via the CMS, maybe some sort of general
    // dom watching that slow it down so much.  This is a hack to simply
    // show one list and hide the other.
    companiesCeo: _.sortBy(_.cloneDeep(companies), c => {
      return c.officers && c.officers[publishYear]
        ? c.officers[publishYear].total
        : 0;
    }).reverse(),
    loading: false,
    publishYear: publishYear,
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

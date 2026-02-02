// Global Configuration for KSG System
// Change URLs here to switch between localhost and production

// For local development:
const API_URL = 'http://localhost:3000';
const BASE_URL = 'http://localhost:3000/';

// For production (uncomment these and comment out localhost):
 //const API_URL = 'https://ksg.freyaaccess.com';
 //const BASE_URL = 'https://ksg.freyaaccess.com/';

const COMPANY = localStorage.getItem('company') || 'KSG';

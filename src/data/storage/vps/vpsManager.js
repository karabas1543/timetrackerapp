// VPS API Manager for Time Tracker App
// Path: src/data/storage/vps/vpsManager.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class VpsManager {
  constructor(config = {}) {
    // Default configuration
    this.baseUrl = config.baseUrl || 'https://your-droplet-ip-or-domain/api';
    this.apiKey = config.apiKey || '';
    this.timeout = config.timeout || 30000; // 30 seconds
    this.retryAttempts = config.retryAttempts || 3;
    
    // Add path for caching auth tokens
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'config');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
    
    // Path to store auth token
    this.tokenPath = path.join(this.configPath, 'vps-token.json');
    
    // API connection state
    this.authenticated = false;
    this.authToken = null;
    this.lastAuthTime = null;
    this.initialized = false;
  }

  /**
   * Initialize VPS connection
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      console.log('Initializing VPS connection...');
      
      // Load configuration
      const config = await this.loadConfig();
      
      // Apply configuration if available
      if (config) {
        if (config.baseUrl) this.baseUrl = config.baseUrl;
        if (config.apiKey) this.apiKey = config.apiKey;
      }
      
      // Try to load saved auth token
      await this.loadAuthToken();
      
      // Check if token is valid or authenticate if needed
      if (!this.authenticated) {
        await this.authenticate();
      }
      
      this.initialized = true;
      console.log('VPS connection initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize VPS connection:', error);
      return false;
    }
  }

  /**
   * Load VPS configuration from file
   * @returns {Promise<Object|null>} - Configuration object or null
   */
  async loadConfig() {
    try {
      const configFilePath = path.join(this.configPath, 'vps-config.json');
      
      if (fs.existsSync(configFilePath)) {
        const configData = fs.readFileSync(configFilePath, 'utf8');
        return JSON.parse(configData);
      }
      
      return null;
    } catch (error) {
      console.error('Error loading VPS config:', error);
      return null;
    }
  }

  /**
   * Save VPS configuration to file
   * @param {Object} config - Configuration to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveConfig(config) {
    try {
      const configFilePath = path.join(this.configPath, 'vps-config.json');
      
      // Apply configuration
      if (config.baseUrl) this.baseUrl = config.baseUrl;
      if (config.apiKey) this.apiKey = config.apiKey;
      
      // Save to file
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving VPS config:', error);
      return false;
    }
  }

  /**
   * Load authentication token from file
   * @returns {Promise<boolean>} - Success status
   */
  async loadAuthToken() {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const tokenData = fs.readFileSync(this.tokenPath, 'utf8');
        const tokenObj = JSON.parse(tokenData);
        
        // Check if token is expired
        const expiresAt = new Date(tokenObj.expiresAt);
        if (expiresAt > new Date()) {
          this.authToken = tokenObj.token;
          this.authenticated = true;
          this.lastAuthTime = new Date(tokenObj.issuedAt);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error loading auth token:', error);
      return false;
    }
  }

  /**
   * Save authentication token to file
   * @returns {Promise<boolean>} - Success status
   */
  async saveAuthToken() {
    try {
      if (!this.authToken) return false;
      
      const tokenObj = {
        token: this.authToken,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };
      
      fs.writeFileSync(this.tokenPath, JSON.stringify(tokenObj, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving auth token:', error);
      return false;
    }
  }

  /**
   * Authenticate with the VPS server
   * @returns {Promise<boolean>} - Success status
   */
  async authenticate() {
    try {
      // Create axios instance for API requests
      const api = axios.create({
        baseURL: this.baseUrl,
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        }
      });
      
      // Make authentication request
      const response = await api.post('/auth/token');
      
      if (response.status === 200 && response.data.token) {
        this.authToken = response.data.token;
        this.authenticated = true;
        this.lastAuthTime = new Date();
        
        // Save token for future use
        await this.saveAuthToken();
        
        console.log('Successfully authenticated with VPS');
        return true;
      } else {
        console.error('Authentication failed:', response.data);
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Create axios instance with auth headers
   * @returns {Object} - Axios instance
   */
  getApiClient() {
    // Ensure we have a token
    if (!this.authToken && !this.apiKey) {
      throw new Error('Not authenticated. Call initialize() first.');
    }
    
    // Create and return axios instance
    return axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        'x-api-key': this.apiKey
      }
    });
  }

  /**
   * Make a GET request to the API
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - Response data
   */
  async get(endpoint, params = {}) {
    try {
      const api = this.getApiClient();
      const response = await api.get(endpoint, { params });
      return response.data;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Make a POST request to the API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - Response data
   */
  async post(endpoint, data = {}) {
    try {
      const api = this.getApiClient();
      const response = await api.post(endpoint, data);
      return response.data;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Make a PUT request to the API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - Response data
   */
  async put(endpoint, data = {}) {
    try {
      const api = this.getApiClient();
      const response = await api.put(endpoint, data);
      return response.data;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Make a DELETE request to the API
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} - Response data
   */
  async delete(endpoint) {
    try {
      const api = this.getApiClient();
      const response = await api.delete(endpoint);
      return response.data;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Upload a file to the API
   * @param {string} endpoint - API endpoint
   * @param {string} filePath - Path to the file
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Response data
   */
  async uploadFile(endpoint, filePath, metadata = {}) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const api = this.getApiClient();
      
      // Create form data
      const FormData = require('form-data');
      const form = new FormData();
      
      // Add file to form
      form.append('file', fs.createReadStream(filePath));
      
      // Add metadata fields
      Object.keys(metadata).forEach(key => {
        form.append(key, metadata[key]);
      });
      
      // Upload file
      const response = await api.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.authToken}`,
          'x-api-key': this.apiKey
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      return response.data;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Download a file from the API
   * @param {string} endpoint - API endpoint
   * @param {string} savePath - Path to save the file
   * @returns {Promise<string>} - Path to the downloaded file
   */
  async downloadFile(endpoint, savePath) {
    try {
      const api = this.getApiClient();
      
      // Create directory if it doesn't exist
      const saveDir = path.dirname(savePath);
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      
      // Download file
      const response = await api.get(endpoint, {
        responseType: 'stream'
      });
      
      // Save file
      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(savePath));
        writer.on('error', reject);
      });
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Handle API errors
   * @param {Error} error - Error object
   */
  async handleApiError(error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Response:', error.response.status, error.response.data);
      
      // Handle authentication errors
      if (error.response.status === 401) {
        console.log('Token expired, re-authenticating...');
        await this.authenticate();
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API No Response:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Request Error:', error.message);
    }
  }

  /**
   * Test the connection to the VPS server
   * @returns {Promise<boolean>} - Success status
   */
  async testConnection() {
    try {
      // Make a simple request to check connection
      const response = await this.get('/health');
      
      if (response && response.status === 'ok') {
        console.log('VPS connection test successful');
        return true;
      } else {
        console.error('VPS connection test failed:', response);
        return false;
      }
    } catch (error) {
      console.error('VPS connection test error:', error);
      return false;
    }
  }
}

module.exports = VpsManager;
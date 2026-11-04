/**
 * Currency Converter Utility
 * Provides currency conversion for multi-currency payments
 */

const axios = require('axios');

// Supported currencies for Flutterwave
const SUPPORTED_CURRENCIES = {
  USD: { name: 'US Dollar', symbol: '$' },
  NGN: { name: 'Nigerian Naira', symbol: '₦' },
  KES: { name: 'Kenyan Shilling', symbol: 'KSh' },
  UGX: { name: 'Ugandan Shilling', symbol: 'USh' },
  RWF: { name: 'Rwandan Franc', symbol: 'RWF' },
  GHS: { name: 'Ghanaian Cedi', symbol: '₵' },
  ZAR: { name: 'South African Rand', symbol: 'R' },
  EUR: { name: 'Euro', symbol: '€' },
  GBP: { name: 'British Pound', symbol: '£' }
};

class CurrencyConverter {
  constructor() {
    this.baseUrl = 'https://api.exchangerate-api.com/v4/latest';
    this.cache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour cache
    this.exchangeRate = 1320; // Fallback rate USD to RWF for backward compatibility
    this.lastUpdated = null;
  }

  /**
   * Get supported currencies list
   */
  getSupportedCurrencies() {
    return SUPPORTED_CURRENCIES;
  }

  /**
   * Get exchange rates from USD to all supported currencies
   */
  async getExchangeRates() {
    const cacheKey = 'exchange_rates';
    const now = Date.now();
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    try {
      const response = await axios.get(`${this.baseUrl}/USD`, {
        timeout: 10000 // Increased timeout to 10 seconds
      });
      
      const rates = response.data.rates;
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: rates,
        timestamp: now
      });
      
      return rates;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      
      // Return cached data if available, otherwise default rates
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey).data;
      }
      
      // Fallback rates (approximate)
      return {
        USD: 1,
        NGN: 1500,
        KES: 130,
        UGX: 3700,
        RWF: 1300,
        GHS: 12,
        ZAR: 18,
        EUR: 0.85,
        GBP: 0.73
      };
    }
  }

  /**
   * Convert amount from USD to target currency
   */
  async convertFromUSD(amountUSD, targetCurrency) {
    if (targetCurrency === 'USD') {
      return {
        originalAmount: amountUSD,
        convertedAmount: amountUSD,
        currency: 'USD',
        rate: 1
      };
    }

    const rates = await this.getExchangeRates();
    const rate = rates[targetCurrency];
    
    if (!rate) {
      throw new Error(`Unsupported currency: ${targetCurrency}`);
    }

    const convertedAmount = Math.round(amountUSD * rate * 100) / 100; // Round to 2 decimal places
    
    return {
      originalAmount: amountUSD,
      convertedAmount: convertedAmount,
      currency: targetCurrency,
      rate: rate
    };
  }

  /**
   * Convert amount from any currency to USD
   */
  async convertToUSD(amount, fromCurrency) {
    if (fromCurrency === 'USD') {
      return amount;
    }

    const rates = await this.getExchangeRates();
    const rate = rates[fromCurrency];
    
    if (!rate) {
      throw new Error(`Unsupported currency: ${fromCurrency}`);
    }

    return Math.round((amount / rate) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Format currency amount with proper symbol and decimals
   */
  formatCurrency(amount, currency) {
    const currencyInfo = SUPPORTED_CURRENCIES[currency];
    if (!currencyInfo) {
      return `${amount} ${currency}`;
    }

    // Different formatting for different currencies
    const formatOptions = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    };

    // Some currencies don't typically show decimals
    if (['UGX', 'RWF'].includes(currency)) {
      formatOptions.minimumFractionDigits = 0;
      formatOptions.maximumFractionDigits = 0;
      amount = Math.round(amount);
    }

    const formattedAmount = amount.toLocaleString('en-US', formatOptions);
    
    return `${currencyInfo.symbol}${formattedAmount}`;
  }

  /**
   * Get currency conversion data for frontend
   */
  async getCurrencyData(baseAmountUSD = 10) {
    const rates = await this.getExchangeRates();
    const currencies = {};

    for (const [code, info] of Object.entries(SUPPORTED_CURRENCIES)) {
      const conversion = await this.convertFromUSD(baseAmountUSD, code);
      currencies[code] = {
        ...info,
        rate: conversion.rate,
        amount: conversion.convertedAmount,
        formatted: this.formatCurrency(conversion.convertedAmount, code)
      };
    }

    return currencies;
  }

  // Backward compatibility methods
  async getExchangeRate() {
    const rates = await this.getExchangeRates();
    this.exchangeRate = rates.RWF || 1320;
    this.lastUpdated = new Date();
    return this.exchangeRate;
  }

  /**
   * Get current exchange rate without updating
   */
  getCurrentRate() {
    return this.exchangeRate;
  }

  async convertToRWF(usdAmount) {
    const conversion = await this.convertFromUSD(usdAmount, 'RWF');
    return Math.round(conversion.convertedAmount);
  }

  async convertRWFToUSD(rwfAmount) {
    return await this.convertToUSD(rwfAmount, 'RWF');
  }

  /**
   * Format amount with currency symbol (backward compatibility)
   */
  formatAmount(amount, currency) {
    return this.formatCurrency(amount, currency);
  }

  /**
   * Get formatted price for display
   */
  getFormattedPrice(amount, currency) {
    return this.formatCurrency(amount, currency);
  }
}

module.exports = new CurrencyConverter();

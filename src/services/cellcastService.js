const axios = require('axios');

class CellcastService {
    constructor() {
        this.apiKey = process.env.CELLCAST_API_KEY;
        this.baseUrl = 'https://api.cellcast.com';
        
        if (!this.apiKey) {
            throw new Error('CELLCAST_API_KEY is required');
        }
    }

    async sendSMS(phoneNumber, message) {
        try {
            // Format phone number for Australian numbers
            const formattedNumber = this.formatPhoneNumber(phoneNumber);
            
            const payload = {
                sender: "#SharedNum#", // Uses Cellcast's shared virtual number
                message: message,
                contacts: [formattedNumber],
                countryCode: 61 // Australia
            };

            const response = await axios.post(`${this.baseUrl}/api/v1/gateway`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                messageId: response.data.data?.queueResponse?.[0]?.MessageId,
                data: response.data
            };

        } catch (error) {
            console.error('Cellcast SMS Error:', error.response?.data || error.message);
            
            // Handle specific Cellcast errors
            if (error.response?.status === 422) {
                throw new Error('Insufficient Cellcast credits. Please recharge your account.');
            }
            
            if (error.response?.status === 401) {
                throw new Error('Cellcast API key is invalid or expired.');
            }
            
            throw new Error(`Failed to send SMS: ${error.response?.data?.message || error.message}`);
        }
    }

    formatPhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Handle different Australian phone number formats
        if (cleaned.startsWith('61')) {
            // Already has country code
            return `+${cleaned}`;
        } else if (cleaned.startsWith('0')) {
            // Remove leading 0 and add country code
            return `+61${cleaned.substring(1)}`;
        } else if (cleaned.length === 9) {
            // Mobile number without leading 0 or country code
            return `+61${cleaned}`;
        } else {
            // Assume it needs country code
            return `+61${cleaned}`;
        }
    }

    async verifyToken() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v1/user/token/verify`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Token verification failed:', error.response?.data || error.message);
            return false;
        }
    }
}

module.exports = new CellcastService();
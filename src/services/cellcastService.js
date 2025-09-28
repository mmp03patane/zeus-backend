
const axios = require('axios');

class CellcastService {
    constructor() {
        this.apiKey = process.env.CELLCAST_API_KEY;
        this.baseUrl = 'https://cellcast.com.au/api/v3'; // Correct URL from docs
        
        if (!this.apiKey) {
            throw new Error('CELLCAST_API_KEY is required');
        }
    }

    async sendSMS(phoneNumber, message) {
        try {
            // Format phone number for Australian numbers
            const formattedNumber = this.formatPhoneNumber(phoneNumber);
            
            // Correct payload structure from official docs
            const payload = {
                sms_text: message,
                numbers: [formattedNumber], // Array format as per docs
                // from: "Zeus", // Optional sender ID - leave blank for shared number
                // source: "Zeus", // Optional tracking
                // custom_string: "invoice-payment" // Optional tracking
            };

            const response = await axios.post(`${this.baseUrl}/send-sms`, payload, {
                headers: {
                    'APPKEY': this.apiKey, // Use APPKEY header as per docs, not Bearer
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            // Handle Cellcast response format from docs
            if (response.data.meta && response.data.meta.code === 200) {
                return {
                    success: true,
                    messageId: response.data.data.messages[0].message_id,
                    data: response.data
                };
            } else {
                throw new Error(response.data.msg || 'SMS sending failed');
            }

        } catch (error) {
            console.error('Cellcast SMS Error:', error.response?.data || error.message);
            
            // Handle specific Cellcast errors based on official docs
            if (error.response?.status === 401) {
                const errorData = error.response.data;
                if (errorData && errorData.meta) {
                    if (errorData.meta.status === 'AUTH_FAILED') {
                        throw new Error('Cellcast API key is invalid or expired.');
                    }
                    if (errorData.meta.status === 'AUTH_FAILED_NO_DATA') {
                        throw new Error('Cellcast API key not provided.');
                    }
                }
                throw new Error('Cellcast API authentication failed.');
            }
            
            if (error.response?.status === 400) {
                const errorData = error.response.data;
                if (errorData && errorData.meta) {
                    if (errorData.meta.status === 'FIELD_INVALID') {
                        throw new Error(`Cellcast error: ${errorData.msg}`);
                    }
                    if (errorData.meta.status === 'RECIPIENTS_ERROR') {
                        throw new Error('Invalid phone number or recipient issue.');
                    }
                    if (errorData.meta.status === 'FIELD_EMPTY') {
                        throw new Error('Required field is empty.');
                    }
                    // Check for credit issues in the message
                    if (errorData.msg && errorData.msg.includes('credit')) {
                        throw new Error('Insufficient Cellcast credits. Please recharge your account.');
                    }
                }
                throw new Error(`Cellcast error: ${errorData.msg || 'Bad request'}`);
            }
            
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please wait before sending more SMS.');
            }
            
            throw new Error(`Failed to send SMS: ${error.response?.data?.msg || error.message}`);
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
            // Test with a minimal SMS to verify the API key works
            // We won't actually send it by using invalid data, just test auth
            const testPayload = {
                sms_text: "test",
                numbers: [] // Empty array will cause RECIPIENTS_ERROR but auth will be validated first
            };

            await axios.post(`${this.baseUrl}/send-sms`, testPayload, {
                headers: {
                    'APPKEY': this.apiKey,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            return true; // If we get here, auth worked
        } catch (error) {
            // If it's a 401 error, auth failed
            if (error.response?.status === 401) {
                return false;
            }
            // If it's a 400 error with RECIPIENTS_ERROR, auth worked but recipients were invalid (expected)
            if (error.response?.status === 400 && 
                error.response.data?.meta?.status === 'RECIPIENTS_ERROR') {
                return true; // Auth worked, just recipients were empty as intended
            }
            // Any other error, assume auth failed
            console.error('Token verification failed:', error.response?.data || error.message);
            return false;
        }
    }
}

module.exports = new CellcastService();
const axios = require('axios');
const logger = require('../utils/logger');

const searchPlaces = async (query) => {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query,
        key: process.env.GOOGLE_API_KEY
      }
    });

    return response.data.results.map(place => ({
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total
    }));

  } catch (error) {
    logger.error('Google Places search error:', error);
    throw error;
  }
};

const getPlaceDetails = async (placeId) => {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'name,formatted_address,rating,user_ratings_total,url',
        key: process.env.GOOGLE_API_KEY
      }
    });

    const place = response.data.result;
    
    // Generate Google review URL
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;

    return {
      placeId,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      googleUrl: place.url,
      reviewUrl
    };

  } catch (error) {
    logger.error('Google Places details error:', error);
    throw error;
  }
};

module.exports = {
  searchPlaces,
  getPlaceDetails
};
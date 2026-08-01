import { getRecommendations } from '../../_lib/recommendations.js';

export async function onRequestGet(context) {
  return getRecommendations(context);
}

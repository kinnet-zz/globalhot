import { postRecommendation } from '../../_lib/recommendations.js';

export async function onRequestPost(context) {
  return postRecommendation(context, context.params?.modelId);
}

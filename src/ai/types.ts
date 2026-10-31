import type { YouTubeCategory, YouTubeVideoMetadata } from '../youtube/types';

export interface AIClassification {
  videoId: string;
  category: YouTubeCategory;
  confidence: number;
  reason: string;
  classifiedAt: number;
}

export interface AIClassificationRequest {
  metadata: Pick<YouTubeVideoMetadata, 'title' | 'channelName' | 'isShort'>;
}

export interface AIClassificationProvider {
  classify(request: AIClassificationRequest): Promise<Omit<AIClassification, 'videoId' | 'classifiedAt'>>;
}

export interface AISettings {
  enabled: boolean;
  endpoint: string;
  model: string;
}

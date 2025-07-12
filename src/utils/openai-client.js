// src/utils/openai-client.js - OpenAI API integration for AI enhancement

/**
 * OpenAI API client with cost tracking and error handling
 */
export class OpenAIClient {
    constructor(apiKey, defaultModel = 'gpt-4o-mini') {
      this.apiKey = apiKey;
      this.defaultModel = defaultModel;
      this.baseURL = 'https://api.openai.com/v1';
      
      // Token pricing per 1K tokens (as of 2024)
      this.pricing = {
        'gpt-4o': { input: 0.0025, output: 0.01 },
        'gpt-4o-mini': { input: 0.000150, output: 0.0006 },
        'gpt-4-turbo': { input: 0.01, output: 0.03 },
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
      };
    }
  
    /**
     * Calculate cost for token usage
     */
    calculateCost(model, inputTokens, outputTokens) {
      const modelPricing = this.pricing[model];
      if (!modelPricing) {
        console.warn(`Unknown model pricing for ${model}, using gpt-4o-mini pricing`);
        return this.calculateCost('gpt-4o-mini', inputTokens, outputTokens);
      }
  
      const inputCost = (inputTokens / 1000) * modelPricing.input;
      const outputCost = (outputTokens / 1000) * modelPricing.output;
      
      return inputCost + outputCost;
    }
  
    /**
     * Make request to OpenAI API with error handling
     */
    async makeRequest(endpoint, data) {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }
  
      return await response.json();
    }
  
    /**
     * Generate chat completion
     */
    async createChatCompletion(options = {}) {
      const {
        messages,
        model = this.defaultModel,
        maxTokens = 1000,
        temperature = 0.7,
        systemPrompt = null
      } = options;
  
      if (!messages || !Array.isArray(messages)) {
        throw new Error('Messages array is required');
      }
  
      // Prepare messages with system prompt if provided
      const finalMessages = [];
      
      if (systemPrompt) {
        finalMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }
      
      finalMessages.push(...messages);
  
      const requestData = {
        model,
        messages: finalMessages,
        max_tokens: maxTokens,
        temperature,
        stream: false
      };
  
      const startTime = Date.now();
      
      try {
        const result = await this.makeRequest('/chat/completions', requestData);
        const endTime = Date.now();
  
        // Calculate costs
        const inputTokens = result.usage?.prompt_tokens || 0;
        const outputTokens = result.usage?.completion_tokens || 0;
        const totalTokens = result.usage?.total_tokens || 0;
        const cost = this.calculateCost(model, inputTokens, outputTokens);
  
        return {
          success: true,
          content: result.choices[0]?.message?.content || '',
          usage: {
            inputTokens,
            outputTokens,
            totalTokens,
            cost
          },
          model,
          processingTime: endTime - startTime,
          finishReason: result.choices[0]?.finish_reason || 'unknown'
        };
  
      } catch (error) {
        console.error('OpenAI API error:', error);
        throw new Error(`AI request failed: ${error.message}`);
      }
    }
  
    /**
     * Create enhanced playlist description
     */
    async enhancePlaylistDescription(playlistData, options = {}) {
      const {
        style = 'educational',
        includeKeywords = true,
        includeLearningObjectives = true,
        includeTargetAudience = true,
        maxLength = 500
      } = options;
  
      const messages = [
        {
          role: 'user',
          content: this.buildDescriptionPrompt(playlistData, {
            style,
            includeKeywords,
            includeLearningObjectives,
            includeTargetAudience,
            maxLength
          })
        }
      ];
  
      const systemPrompt = `You are an expert educational content curator who specializes in creating compelling, informative playlist descriptions. Your descriptions should be engaging, educational, and help learners understand what they'll gain from the content.
  
  Key principles:
  - Focus on learning outcomes and educational value
  - Use clear, accessible language
  - Highlight key concepts and themes
  - Make content discoverable and appealing
  - Be concise but comprehensive`;
  
      return await this.createChatCompletion({
        messages,
        systemPrompt,
        maxTokens: Math.min(maxLength * 2, 1000), // Allow some buffer
        temperature: 0.7
      });
    }
  
    /**
     * Build prompt for playlist description enhancement
     */
    buildDescriptionPrompt(playlistData, options) {
      const {
        style,
        includeKeywords,
        includeLearningObjectives,
        includeTargetAudience,
        maxLength
      } = options;
  
      let prompt = `Please create an enhanced description for this playlist:\n\n`;
      
      prompt += `Title: "${playlistData.title}"\n`;
      prompt += `Original Description: "${playlistData.originalDescription || 'No description provided'}"\n`;
      prompt += `Number of Videos: ${playlistData.videoCount}\n`;
      
      if (playlistData.videos && playlistData.videos.length > 0) {
        prompt += `\nVideo Titles:\n`;
        playlistData.videos.slice(0, 10).forEach((video, index) => {
          prompt += `${index + 1}. ${video.title}\n`;
        });
        
        if (playlistData.videos.length > 10) {
          prompt += `... and ${playlistData.videos.length - 10} more videos\n`;
        }
      }
  
      if (playlistData.analysis) {
        prompt += `\nContent Analysis:\n`;
        if (playlistData.analysis.topics) {
          prompt += `Topics: ${playlistData.analysis.topics.join(', ')}\n`;
        }
        if (playlistData.analysis.themes) {
          prompt += `Themes: ${playlistData.analysis.themes.join(', ')}\n`;
        }
        if (playlistData.analysis.difficulty) {
          prompt += `Difficulty Level: ${playlistData.analysis.difficulty}\n`;
        }
      }
  
      prompt += `\nPlease create a ${style} description that:\n`;
      
      if (includeLearningObjectives) {
        prompt += `- Clearly outlines what learners will achieve\n`;
      }
      
      if (includeKeywords) {
        prompt += `- Includes relevant keywords for discoverability\n`;
      }
      
      if (includeTargetAudience) {
        prompt += `- Identifies the target audience\n`;
      }
  
      prompt += `- Highlights the educational value and key concepts\n`;
      prompt += `- Is engaging and encourages learning\n`;
      prompt += `- Is approximately ${maxLength} characters long\n`;
      
      switch (style) {
        case 'educational':
          prompt += `- Uses an academic but accessible tone\n`;
          prompt += `- Emphasizes learning outcomes and skill development\n`;
          break;
        case 'concise':
          prompt += `- Is brief and to the point\n`;
          prompt += `- Focuses on core value proposition\n`;
          break;
        case 'detailed':
          prompt += `- Provides comprehensive information about content\n`;
          prompt += `- Includes detailed breakdown of topics covered\n`;
          break;
        case 'creative':
          prompt += `- Uses engaging, creative language\n`;
          prompt += `- Makes learning sound exciting and accessible\n`;
          break;
      }
  
      prompt += `\nReturn only the enhanced description text, without quotes or additional commentary.`;
  
      return prompt;
    }
  
    /**
     * Analyze playlist content for themes and topics
     */
    async analyzePlaylistContent(playlistData) {
      const messages = [
        {
          role: 'user',
          content: this.buildAnalysisPrompt(playlistData)
        }
      ];
  
      const systemPrompt = `You are an expert content analyst who identifies themes, topics, educational patterns, and learning objectives from playlist data. Provide structured analysis in JSON format.`;
  
      const result = await this.createChatCompletion({
        messages,
        systemPrompt,
        maxTokens: 800,
        temperature: 0.3 // Lower temperature for more consistent analysis
      });
  
      try {
        // Try to parse JSON from the response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return {
            ...result,
            analysis: JSON.parse(jsonMatch[0])
          };
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse analysis JSON:', parseError);
        // Return a basic structure if parsing fails
        return {
          ...result,
          analysis: {
            topics: [],
            themes: [],
            difficulty: 'unknown',
            keywords: [],
            targetAudience: 'general',
            estimatedDuration: 'unknown'
          }
        };
      }
    }
  
    /**
     * Build prompt for content analysis
     */
    buildAnalysisPrompt(playlistData) {
      let prompt = `Analyze this playlist for educational content structure:\n\n`;
      
      prompt += `Title: "${playlistData.title}"\n`;
      prompt += `Description: "${playlistData.originalDescription || 'No description'}"\n`;
      prompt += `Video Count: ${playlistData.videoCount}\n\n`;
  
      if (playlistData.videos && playlistData.videos.length > 0) {
        prompt += `Video Titles:\n`;
        playlistData.videos.forEach((video, index) => {
          prompt += `${index + 1}. "${video.title}"\n`;
          if (video.description && video.description.length > 0) {
            prompt += `   Description: ${video.description.substring(0, 200)}...\n`;
          }
          if (video.duration) {
            prompt += `   Duration: ${video.duration}\n`;
          }
        });
      }
  
      prompt += `\nPlease analyze this content and return a JSON object with the following structure:
  {
    "topics": ["topic1", "topic2", ...],
    "themes": ["theme1", "theme2", ...],
    "difficulty": "beginner|intermediate|advanced",
    "keywords": ["keyword1", "keyword2", ...],
    "targetAudience": "description of target audience",
    "learningObjectives": ["objective1", "objective2", ...],
    "estimatedDuration": "estimated total learning time",
    "contentType": "tutorial|lecture|demonstration|mixed",
    "prerequisites": ["prerequisite1", "prerequisite2", ...],
    "relatedFields": ["field1", "field2", ...]
  }
  
  Focus on:
  - Educational topics and subject matter
  - Learning difficulty and prerequisites
  - Target audience characteristics
  - Key concepts and themes
  - Relevant keywords for searchability
  
  Return only the JSON object, no additional text.`;
  
      return prompt;
    }
  
    /**
     * Generate learning objectives for a playlist
     */
    async generateLearningObjectives(playlistData, analysisData = null) {
      const analysis = analysisData || { topics: [], difficulty: 'intermediate' };
  
      const messages = [
        {
          role: 'user',
          content: `Generate 3-5 specific, measurable learning objectives for this playlist:
  
  Title: "${playlistData.title}"
  Topics: ${analysis.topics?.join(', ') || 'Not specified'}
  Difficulty: ${analysis.difficulty || 'intermediate'}
  Video Count: ${playlistData.videoCount}
  
  Learning objectives should:
  - Start with action verbs (understand, analyze, create, evaluate, etc.)
  - Be specific and measurable
  - Be appropriate for the difficulty level
  - Reflect the actual content covered
  
  Format as a JSON array of strings:
  ["By the end of this playlist, learners will be able to...", ...]`
        }
      ];
  
      const systemPrompt = `You are an instructional design expert who creates clear, measurable learning objectives that align with educational content and appropriate cognitive levels.`;
  
      return await this.createChatCompletion({
        messages,
        systemPrompt,
        maxTokens: 400,
        temperature: 0.5
      });
    }
  
    /**
     * Validate API key and test connection
     */
    async validateConnection() {
      try {
        const result = await this.createChatCompletion({
          messages: [
            {
              role: 'user',
              content: 'Please respond with "Connection successful" to test the API connection.'
            }
          ],
          maxTokens: 10,
          temperature: 0
        });
  
        return {
          valid: true,
          message: 'OpenAI API connection successful',
          model: result.model,
          cost: result.usage.cost
        };
  
      } catch (error) {
        return {
          valid: false,
          message: `OpenAI API connection failed: ${error.message}`,
          error: error.message
        };
      }
    }
  }
  
  /**
   * Helper functions for content preparation
   */
  export const ContentPreparation = {
    /**
     * Prepare playlist data for AI processing
     */
    preparePlaylistData(playlist, videos = []) {
      return {
        id: playlist.id,
        title: playlist.title,
        originalDescription: playlist.original_description || '',
        videoCount: playlist.video_count || videos.length,
        videos: videos.map(video => ({
          id: video.id,
          title: video.title,
          description: video.description,
          duration: video.duration,
          channelName: video.channel_name
        }))
      };
    },
  
    /**
     * Sanitize and validate enhanced content
     */
    sanitizeEnhancedContent(content, maxLength = 2000) {
      if (!content || typeof content !== 'string') {
        throw new Error('Invalid content provided');
      }
  
      // Remove any markdown formatting that might interfere
      let sanitized = content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`([^`]+)`/g, '$1') // Remove inline code
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace( /\*(.*?)\*/g, '$1') // Remove italic
        .trim();
  
      // Ensure reasonable length
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength - 3) + '...';
      }
  
      // Validate that it's not just whitespace
      if (sanitized.length < 10) {
        throw new Error('Enhanced content is too short');
      }
  
      return sanitized;
    },
  
    /**
     * Extract key metrics from enhancement result
     */
    extractMetrics(enhancementResult) {
      return {
        inputTokens: enhancementResult.usage?.inputTokens || 0,
        outputTokens: enhancementResult.usage?.outputTokens || 0,
        totalTokens: enhancementResult.usage?.totalTokens || 0,
        cost: enhancementResult.usage?.cost || 0,
        processingTime: enhancementResult.processingTime || 0,
        model: enhancementResult.model || 'unknown',
        finishReason: enhancementResult.finishReason || 'unknown'
      };
    }
  };
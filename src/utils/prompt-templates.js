// src/utils/prompt-templates.js - AI prompt templates for playlist enhancement

/**
 * Prompt templates for different AI enhancement tasks
 */
export class PromptTemplates {
  
    /**
     * Generate system prompt based on enhancement style and preferences
     */
    static getSystemPrompt(style = 'educational', preferences = {}) {
      const basePrompt = `You are an expert educational content curator and instructional designer who specializes in creating compelling, informative playlist descriptions that help learners understand the educational value and learning outcomes of video content.`;
  
      const stylePrompts = {
        educational: `
          Focus on:
          - Clear learning objectives and outcomes
          - Educational value and skill development
          - Academic yet accessible language
          - Structured information presentation
          - Target audience identification`,
        
        concise: `
          Focus on:
          - Brief, impactful descriptions
          - Core value propositions
          - Essential information only
          - Clear and direct language
          - Quick comprehension`,
        
        detailed: `
          Focus on:
          - Comprehensive content breakdowns
          - Detailed topic coverage
          - In-depth explanations
          - Prerequisites and requirements
          - Extended learning context`,
        
        creative: `
          Focus on:
          - Engaging, inspiring language
          - Creative metaphors and examples
          - Excitement about learning
          - Accessible technical concepts
          - Motivational tone`,
        
        professional: `
          Focus on:
          - Industry-relevant language
          - Professional development context
          - Career advancement value
          - Practical applications
          - Business relevance`
      };
  
      let systemPrompt = basePrompt + (stylePrompts[style] || stylePrompts.educational);
  
      // Add preference-specific instructions
      if (preferences.includeKeywords) {
        systemPrompt += `\n- Include relevant keywords for discoverability`;
      }
      
      if (preferences.includeLearningObjectives) {
        systemPrompt += `\n- Clearly state what learners will achieve`;
      }
      
      if (preferences.includeTargetAudience) {
        systemPrompt += `\n- Identify the intended audience`;
      }
      
      if (preferences.includeDifficulty) {
        systemPrompt += `\n- Indicate difficulty level and prerequisites`;
      }
  
      if (preferences.language && preferences.language !== 'en') {
        systemPrompt += `\n- Respond in ${this.getLanguageName(preferences.language)}`;
      }
  
      return systemPrompt;
    }
  
    /**
     * Generate enhanced description prompt
     */
    static getDescriptionEnhancementPrompt(playlistData, options = {}) {
      const {
        style = 'educational',
        maxLength = 500,
        includeKeywords = true,
        includeLearningObjectives = true,
        includeTargetAudience = true,
        contentLevel = 'intermediate'
      } = options;
  
      let prompt = `Please create an enhanced description for this playlist:\n\n`;
      
      // Basic playlist information
      prompt += `**Playlist Information:**\n`;
      prompt += `Title: "${playlistData.title}"\n`;
      prompt += `Original Description: "${playlistData.originalDescription || 'No description provided'}"\n`;
      prompt += `Number of Videos: ${playlistData.videoCount}\n`;
      
      // Video titles for context
      if (playlistData.videos && playlistData.videos.length > 0) {
        prompt += `\n**Video Titles:**\n`;
        playlistData.videos.slice(0, 15).forEach((video, index) => {
          prompt += `${index + 1}. ${video.title}\n`;
        });
        
        if (playlistData.videos.length > 15) {
          prompt += `... and ${playlistData.videos.length - 15} more videos\n`;
        }
      }
  
      // Content analysis if available
      if (playlistData.analysis) {
        prompt += `\n**Content Analysis:**\n`;
        
        if (playlistData.analysis.topics?.length > 0) {
          prompt += `Topics: ${playlistData.analysis.topics.slice(0, 8).join(', ')}\n`;
        }
        
        if (playlistData.analysis.themes?.length > 0) {
          prompt += `Themes: ${playlistData.analysis.themes.join(', ')}\n`;
        }
        
        if (playlistData.analysis.difficulty) {
          prompt += `Difficulty Level: ${playlistData.analysis.difficulty}\n`;
        }
        
        if (playlistData.analysis.targetAudience) {
          prompt += `Target Audience: ${playlistData.analysis.targetAudience}\n`;
        }
      }
  
      // Enhancement requirements
      prompt += `\n**Enhancement Requirements:**\n`;
      prompt += `- Style: ${style}\n`;
      prompt += `- Target length: approximately ${maxLength} characters\n`;
      prompt += `- Content level: ${contentLevel}\n`;
  
      // Specific inclusions
      const inclusions = [];
      if (includeLearningObjectives) inclusions.push('clear learning objectives');
      if (includeKeywords) inclusions.push('relevant keywords for discoverability');
      if (includeTargetAudience) inclusions.push('target audience identification');
      
      if (inclusions.length > 0) {
        prompt += `- Include: ${inclusions.join(', ')}\n`;
      }
  
      // Style-specific instructions
      prompt += this.getStyleSpecificInstructions(style);
  
      prompt += `\n**Output Instructions:**\n`;
      prompt += `Return only the enhanced description text. Do not include quotes, markdown formatting, or additional commentary. The description should be ready to use directly.`;
  
      return prompt;
    }
  
    /**
     * Generate content analysis prompt
     */
    static getContentAnalysisPrompt(playlistData) {
      let prompt = `Analyze this educational playlist for content structure and learning characteristics:\n\n`;
      
      prompt += `**Playlist:** "${playlistData.title}"\n`;
      prompt += `**Original Description:** "${playlistData.originalDescription || 'No description provided'}"\n`;
      prompt += `**Video Count:** ${playlistData.videoCount}\n\n`;
  
      if (playlistData.videos && playlistData.videos.length > 0) {
        prompt += `**Video Content:**\n`;
        playlistData.videos.forEach((video, index) => {
          prompt += `${index + 1}. "${video.title}"`;
          if (video.duration) prompt += ` (${video.duration})`;
          if (video.channelName) prompt += ` - ${video.channelName}`;
          prompt += `\n`;
          
          if (video.description && video.description.length > 50) {
            prompt += `   Description: ${video.description.substring(0, 150)}...\n`;
          }
        });
      }
  
      prompt += `\n**Analysis Required:**\n`;
      prompt += `Please analyze this content and return a JSON object with comprehensive educational metadata:\n\n`;
  
      prompt += `{
    "topics": ["primary topic 1", "primary topic 2", "..."],
    "themes": ["educational theme 1", "theme 2", "..."],
    "difficulty": "beginner|intermediate|advanced",
    "targetAudience": "detailed description of ideal learners",
    "learningObjectives": [
      "By completing this playlist, learners will be able to...",
      "Learners will understand...",
      "Learners will be capable of..."
    ],
    "prerequisites": ["prerequisite 1", "prerequisite 2", "..."],
    "estimatedDuration": "total learning time estimate",
    "contentType": "tutorial|lecture|demonstration|workshop|mixed",
    "skillLevel": "entry-level|intermediate|advanced|expert",
    "relatedFields": ["field 1", "field 2", "..."],
    "keywords": ["searchable keyword 1", "keyword 2", "..."],
    "learningPath": {
      "hasProgression": true|false,
      "structure": "linear|modular|exploratory",
      "complexity": "increasing|consistent|mixed"
    },
    "practicalApplications": ["application 1", "application 2", "..."],
    "industryRelevance": ["industry 1", "industry 2", "..."]
  }`;
  
      prompt += `\n**Analysis Guidelines:**\n`;
      prompt += `- Focus on educational value and learning outcomes\n`;
      prompt += `- Consider the progression and structure of content\n`;
      prompt += `- Identify practical skills and knowledge gained\n`;
      prompt += `- Assess complexity and prerequisite knowledge\n`;
      prompt += `- Extract meaningful keywords for searchability\n`;
      prompt += `- Determine target audience characteristics\n`;
      prompt += `- Evaluate industry and career relevance\n\n`;
  
      prompt += `Return only the JSON object, no additional text or formatting.`;
  
      return prompt;
    }
  
    /**
     * Generate learning objectives prompt
     */
    static getLearningObjectivesPrompt(playlistData, analysis = null) {
      let prompt = `Generate specific, measurable learning objectives for this educational playlist:\n\n`;
      
      prompt += `**Playlist:** "${playlistData.title}"\n`;
      prompt += `**Content:** ${playlistData.videoCount} videos\n`;
      
      if (analysis) {
        if (analysis.topics) prompt += `**Topics:** ${analysis.topics.slice(0, 5).join(', ')}\n`;
        if (analysis.difficulty) prompt += `**Difficulty:** ${analysis.difficulty}\n`;
        if (analysis.targetAudience) prompt += `**Audience:** ${analysis.targetAudience}\n`;
      }
  
      prompt += `\n**Sample Video Titles:**\n`;
      if (playlistData.videos && playlistData.videos.length > 0) {
        playlistData.videos.slice(0, 8).forEach((video, index) => {
          prompt += `${index + 1}. ${video.title}\n`;
        });
      }
  
      prompt += `\n**Requirements:**\n`;
      prompt += `Create 4-6 learning objectives that are:\n`;
      prompt += `- Specific and measurable\n`;
      prompt += `- Action-oriented (using verbs like: analyze, create, evaluate, apply, synthesize)\n`;
      prompt += `- Appropriate for the content difficulty level\n`;
      prompt += `- Focused on practical skills and knowledge\n`;
      prompt += `- Written from the learner's perspective\n\n`;
  
      prompt += `**Format:** Return as a JSON array of strings:\n`;
      prompt += `["By the end of this playlist, learners will be able to...", "Learners will understand...", "..."]`;
  
      return prompt;
    }
  
    /**
     * Generate title enhancement prompt
     */
    static getTitleEnhancementPrompt(playlistData, analysis = null) {
      let prompt = `Suggest an improved title for this playlist that better communicates its educational value:\n\n`;
      
      prompt += `**Current Title:** "${playlistData.title}"\n`;
      prompt += `**Content:** ${playlistData.videoCount} videos\n`;
      
      if (analysis) {
        if (analysis.topics) prompt += `**Main Topics:** ${analysis.topics.slice(0, 3).join(', ')}\n`;
        if (analysis.difficulty) prompt += `**Level:** ${analysis.difficulty}\n`;
        if (analysis.targetAudience) prompt += `**Audience:** ${analysis.targetAudience}\n`;
      }
  
      prompt += `\n**Sample Content:**\n`;
      if (playlistData.videos && playlistData.videos.length > 0) {
        playlistData.videos.slice(0, 5).forEach((video, index) => {
          prompt += `${index + 1}. ${video.title}\n`;
        });
      }
  
      prompt += `\n**Title Requirements:**\n`;
      prompt += `- Clear and descriptive (50-80 characters)\n`;
      prompt += `- Includes key topics or skills\n`;
      prompt += `- Appeals to target audience\n`;
      prompt += `- Suggests learning outcomes\n`;
      prompt += `- Optimized for search discoverability\n`;
      prompt += `- Professional yet engaging tone\n\n`;
  
      prompt += `Provide 3-5 alternative titles as a JSON array of strings.`;
  
      return prompt;
    }
  
    /**
     * Generate categorization prompt
     */
    static getCategorizationPrompt(playlistData) {
      let prompt = `Categorize this playlist within educational and subject taxonomies:\n\n`;
      
      prompt += `**Playlist:** "${playlistData.title}"\n`;
      prompt += `**Description:** "${playlistData.originalDescription || 'None'}"\n`;
      prompt += `**Videos:** ${playlistData.videoCount}\n\n`;
  
      if (playlistData.videos && playlistData.videos.length > 0) {
        prompt += `**Sample Titles:**\n`;
        playlistData.videos.slice(0, 10).forEach((video, index) => {
          prompt += `${index + 1}. ${video.title}\n`;
        });
      }
  
      prompt += `\n**Categorization Required:**\n`;
      prompt += `Return a JSON object with the following categorizations:\n\n`;
  
      prompt += `{
    "primaryCategory": "main subject area",
    "secondaryCategories": ["related area 1", "related area 2"],
    "educationalLevel": "elementary|secondary|undergraduate|graduate|professional",
    "subjectDiscipline": "computer science|mathematics|science|business|arts|etc",
    "instructionalType": "tutorial|course|workshop|lecture|demonstration|reference",
    "skillType": "technical|creative|analytical|practical|theoretical",
    "careerRelevance": ["career path 1", "career path 2"],
    "certificationAlignment": ["relevant certification 1", "certification 2"],
    "tags": ["searchable tag 1", "tag 2", "tag 3"]
  }`;
  
      prompt += `\nBase categorization on content analysis, educational structure, and learning outcomes.`;
  
      return prompt;
    }
  
    /**
     * Get style-specific instructions
     */
    static getStyleSpecificInstructions(style) {
      const instructions = {
        educational: `
  - Use academic but accessible language
  - Structure information logically with clear progression
  - Emphasize learning outcomes and skill development
  - Include educational terminology appropriately
  - Focus on knowledge transfer and comprehension`,
  
        concise: `
  - Be direct and impactful
  - Eliminate unnecessary words
  - Focus on core value propositions
  - Use short, clear sentences
  - Prioritize essential information only`,
  
        detailed: `
  - Provide comprehensive information about content
  - Include detailed breakdowns of topics covered
  - Explain context and background where relevant
  - Describe the learning journey and progression
  - Address prerequisites and follow-up learning`,
  
        creative: `
  - Use engaging, inspirational language
  - Include creative metaphors and analogies
  - Make technical concepts accessible and exciting
  - Use dynamic, action-oriented language
  - Create enthusiasm for learning`,
  
        professional: `
  - Use industry-standard terminology
  - Focus on career and business applications
  - Emphasize practical, real-world value
  - Include professional development context
  - Address skill gaps and market demands`
      };
  
      return instructions[style] || instructions.educational;
    }
  
    /**
     * Get language name from code
     */
    static getLanguageName(languageCode) {
      const languages = {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese',
        'ar': 'Arabic',
        'hi': 'Hindi'
      };
  
      return languages[languageCode] || 'English';
    }
  
    /**
     * Generate user preference-based prompt modifications
     */
    static getUserPreferencePrompt(preferences) {
      let additions = [];
  
      if (preferences.customPromptAdditions) {
        additions.push(`Custom requirements: ${preferences.customPromptAdditions}`);
      }
  
      if (preferences.contentLevel) {
        additions.push(`Target content level: ${preferences.contentLevel}`);
      }
  
      if (preferences.languagePreference && preferences.languagePreference !== 'en') {
        additions.push(`Language: Respond in ${this.getLanguageName(preferences.languagePreference)}`);
      }
  
      if (preferences.enhancementStyle) {
        additions.push(`Preferred style: ${preferences.enhancementStyle}`);
      }
  
      return additions.length > 0 ? `\n**User Preferences:**\n${additions.join('\n')}\n` : '';
    }
  
    /**
     * Generate batch processing prompt for multiple playlists
     */
    static getBatchProcessingPrompt(playlists, enhancementType = 'description') {
      let prompt = `Process multiple playlists for ${enhancementType} enhancement:\n\n`;
      
      playlists.forEach((playlist, index) => {
        prompt += `**Playlist ${index + 1}:**\n`;
        prompt += `Title: "${playlist.title}"\n`;
        prompt += `Description: "${playlist.originalDescription || 'None'}"\n`;
        prompt += `Videos: ${playlist.videoCount}\n\n`;
      });
  
      prompt += `**Requirements:**\n`;
      prompt += `- Process each playlist individually\n`;
      prompt += `- Maintain consistent quality and style\n`;
      prompt += `- Return results as JSON array with playlist IDs\n`;
      prompt += `- Include confidence scores for each result\n\n`;
  
      prompt += `**Output Format:**\n`;
      prompt += `[
    {
      "playlistId": "id1",
      "enhanced${enhancementType}": "result text",
      "confidence": 0.8,
      "reasoning": "brief explanation"
    },
    ...
  ]`;
  
      return prompt;
    }
  }
  
  /**
   * Prompt validation and optimization utilities
   */
  export class PromptOptimizer {
    
    /**
     * Estimate token count for prompt (rough approximation)
     */
    static estimateTokenCount(text) {
      // Rough estimation: ~4 characters per token on average
      return Math.ceil(text.length / 4);
    }
  
    /**
     * Optimize prompt length to stay within token limits
     */
    static optimizePromptLength(prompt, maxTokens = 4000) {
      const estimatedTokens = this.estimateTokenCount(prompt);
      
      if (estimatedTokens <= maxTokens) {
        return prompt;
      }
  
      // If too long, truncate less important sections
      const lines = prompt.split('\n');
      const importantSections = ['Requirements', 'Output', 'Instructions'];
      
      // Keep important sections, truncate others
      let optimizedPrompt = '';
      let currentTokens = 0;
      
      for (const line of lines) {
        const lineTokens = this.estimateTokenCount(line);
        
        if (currentTokens + lineTokens > maxTokens) {
          // Check if this is an important section
          const isImportant = importantSections.some(section => 
            line.includes(section) || line.startsWith('**')
          );
          
          if (!isImportant) {
            break; // Stop adding non-important content
          }
        }
        
        optimizedPrompt += line + '\n';
        currentTokens += lineTokens;
      }
  
      return optimizedPrompt;
    }
  
    /**
     * Validate prompt structure and content
     */
    static validatePrompt(prompt, type = 'description') {
      const validation = {
        valid: true,
        warnings: [],
        suggestions: []
      };
  
      // Check minimum length
      if (prompt.length < 100) {
        validation.valid = false;
        validation.warnings.push('Prompt is too short for effective AI processing');
      }
  
      // Check maximum length
      const tokenCount = this.estimateTokenCount(prompt);
      if (tokenCount > 8000) {
        validation.warnings.push('Prompt may exceed token limits and be truncated');
      }
  
      // Check for required elements based on type
      const requiredElements = {
        description: ['title', 'description', 'requirements'],
        analysis: ['content', 'json', 'analysis'],
        objectives: ['objectives', 'learners', 'able to']
      };
  
      if (requiredElements[type]) {
        const missingElements = requiredElements[type].filter(element =>
          !prompt.toLowerCase().includes(element)
        );
        
        if (missingElements.length > 0) {
          validation.suggestions.push(
            `Consider including: ${missingElements.join(', ')}`
          );
        }
      }
  
      return validation;
    }
  }
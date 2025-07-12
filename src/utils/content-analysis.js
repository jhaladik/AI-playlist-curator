// src/utils/content-analysis.js - Content analysis and categorization engine

/**
 * Content Analysis Engine for extracting themes, topics, and educational patterns
 */
export class ContentAnalysisEngine {
    constructor(db, aiClient = null) {
      this.db = db;
      this.aiClient = aiClient;
      this.cacheExpiration = 7 * 24 * 60 * 60; // 7 days in seconds
    }
  
    /**
     * Get cached analysis or perform new analysis
     */
    async getCachedOrAnalyze(playlistId, analysisType, analysisFunction) {
      try {
        // Check for cached analysis
        const cached = await this.db.prepare(`
          SELECT analysis_data, confidence_score, created_at 
          FROM content_analysis 
          WHERE playlist_id = ? AND analysis_type = ? AND expires_at > strftime('%s', 'now')
        `).bind(playlistId, analysisType).first();
  
        if (cached) {
          return {
            cached: true,
            data: JSON.parse(cached.analysis_data),
            confidence: cached.confidence_score,
            analyzedAt: cached.created_at
          };
        }
  
        // Perform new analysis
        const result = await analysisFunction();
        
        // Cache the result
        await this.storeAnalysis(playlistId, analysisType, result.data, result.confidence || 0.8);
        
        return {
          cached: false,
          ...result
        };
  
      } catch (error) {
        console.error(`Analysis error for ${analysisType}:`, error);
        return {
          cached: false,
          data: this.getDefaultAnalysis(analysisType),
          confidence: 0.0,
          error: error.message
        };
      }
    }
  
    /**
     * Store analysis results in cache
     */
    async storeAnalysis(playlistId, analysisType, data, confidence) {
      const id = crypto.randomUUID();
      const expiresAt = Math.floor(Date.now() / 1000) + this.cacheExpiration;
  
      await this.db.prepare(`
        INSERT OR REPLACE INTO content_analysis 
        (id, playlist_id, analysis_type, analysis_data, confidence_score, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, playlistId, analysisType, JSON.stringify(data), confidence, expiresAt).run();
    }
  
    /**
     * Analyze playlist topics using video titles and descriptions
     */
    async analyzeTopics(playlistId, videos = []) {
      return await this.getCachedOrAnalyze(playlistId, 'topics', async () => {
        const topics = new Set();
        const topicPatterns = this.getTopicPatterns();
        
        // Extract from playlist title
        const playlist = await this.getPlaylistData(playlistId);
        if (playlist?.title) {
          this.extractTopicsFromText(playlist.title, topics, topicPatterns);
        }
  
        // Extract from video titles and descriptions
        videos.forEach(video => {
          this.extractTopicsFromText(video.title, topics, topicPatterns);
          if (video.description) {
            this.extractTopicsFromText(video.description, topics, topicPatterns);
          }
        });
  
        // Convert to ranked list
        const rankedTopics = this.rankTopics(Array.from(topics), videos);
  
        return {
          data: {
            topics: rankedTopics.slice(0, 10), // Top 10 topics
            allTopics: rankedTopics,
            extractionMethod: 'pattern-matching',
            videoCount: videos.length
          },
          confidence: rankedTopics.length > 0 ? 0.7 : 0.3
        };
      });
    }
  
    /**
     * Analyze content themes and educational patterns
     */
    async analyzeThemes(playlistId, videos = []) {
      return await this.getCachedOrAnalyze(playlistId, 'themes', async () => {
        const themes = [];
        const themePatterns = this.getThemePatterns();
        
        // Analyze video titles for educational patterns
        const titleAnalysis = this.analyzeEducationalPatterns(videos.map(v => v.title));
        
        // Detect content progression
        const progression = this.detectContentProgression(videos);
        
        // Identify instructional formats
        const formats = this.identifyInstructionalFormats(videos);
  
        themes.push(...titleAnalysis.themes);
        
        if (progression.hasProgression) {
          themes.push('progressive-learning');
        }
        
        themes.push(...formats);
  
        return {
          data: {
            themes: [...new Set(themes)],
            progression,
            formats: formats,
            educationalStructure: titleAnalysis.structure
          },
          confidence: themes.length > 0 ? 0.8 : 0.4
        };
      });
    }
  
    /**
     * Analyze difficulty level based on content indicators
     */
    async analyzeDifficulty(playlistId, videos = []) {
      return await this.getCachedOrAnalyze(playlistId, 'difficulty', async () => {
        const indicators = {
          beginner: 0,
          intermediate: 0,
          advanced: 0
        };
  
        const difficultyKeywords = {
          beginner: [
            'intro', 'introduction', 'basics', 'fundamentals', 'getting started',
            'beginner', 'basic', 'simple', 'easy', 'tutorial', 'how to',
            'step by step', 'guide', 'overview', 'primer'
          ],
          intermediate: [
            'intermediate', 'practical', 'application', 'implementing',
            'building', 'creating', 'developing', 'examples', 'case study',
            'workshop', 'hands-on', 'project'
          ],
          advanced: [
            'advanced', 'expert', 'deep dive', 'optimization', 'performance',
            'architecture', 'scaling', 'complex', 'sophisticated', 'mastery',
            'professional', 'enterprise', 'production'
          ]
        };
  
        // Analyze titles and descriptions
        videos.forEach(video => {
          const text = (video.title + ' ' + (video.description || '')).toLowerCase();
          
          Object.entries(difficultyKeywords).forEach(([level, keywords]) => {
            keywords.forEach(keyword => {
              if (text.includes(keyword)) {
                indicators[level]++;
              }
            });
          });
        });
  
        // Determine difficulty level
        const totalIndicators = indicators.beginner + indicators.intermediate + indicators.advanced;
        let difficulty = 'intermediate'; // default
        let confidence = 0.5;
  
        if (totalIndicators > 0) {
          const percentages = {
            beginner: indicators.beginner / totalIndicators,
            intermediate: indicators.intermediate / totalIndicators,
            advanced: indicators.advanced / totalIndicators
          };
  
          difficulty = Object.entries(percentages)
            .sort(([,a], [,b]) => b - a)[0][0];
          
          confidence = Math.max(...Object.values(percentages));
        }
  
        return {
          data: {
            difficulty,
            indicators,
            breakdown: {
              beginner: indicators.beginner,
              intermediate: indicators.intermediate,
              advanced: indicators.advanced
            },
            confidence
          },
          confidence
        };
      });
    }
  
    /**
     * Generate comprehensive keywords for searchability
     */
    async generateKeywords(playlistId, videos = []) {
      return await this.getCachedOrAnalyze(playlistId, 'keywords', async () => {
        const keywords = new Set();
        const playlist = await this.getPlaylistData(playlistId);
  
        // Extract from title
        if (playlist?.title) {
          this.extractKeywords(playlist.title, keywords);
        }
  
        // Extract from video titles
        videos.forEach(video => {
          this.extractKeywords(video.title, keywords);
          if (video.channelName) {
            this.extractKeywords(video.channelName, keywords);
          }
        });
  
        // Add educational keywords
        const educationalKeywords = this.generateEducationalKeywords(videos);
        educationalKeywords.forEach(kw => keywords.add(kw));
  
        // Filter and rank keywords
        const filteredKeywords = this.filterKeywords(Array.from(keywords));
        const rankedKeywords = this.rankKeywords(filteredKeywords, videos);
  
        return {
          data: {
            keywords: rankedKeywords.slice(0, 20),
            allKeywords: rankedKeywords,
            categories: {
              technical: rankedKeywords.filter(kw => this.isTechnicalKeyword(kw)),
              educational: rankedKeywords.filter(kw => this.isEducationalKeyword(kw)),
              topical: rankedKeywords.filter(kw => this.isTopicalKeyword(kw))
            }
          },
          confidence: rankedKeywords.length > 0 ? 0.8 : 0.4
        };
      });
    }
  
    /**
     * Perform comprehensive AI-powered analysis
     */
    async performAIAnalysis(playlistId, videos = []) {
      if (!this.aiClient) {
        throw new Error('AI client not configured');
      }
  
      const playlist = await this.getPlaylistData(playlistId);
      const playlistData = {
        id: playlistId,
        title: playlist?.title || '',
        originalDescription: playlist?.original_description || '',
        videoCount: videos.length,
        videos: videos.slice(0, 20) // Limit for token usage
      };
  
      try {
        const result = await this.aiClient.analyzePlaylistContent(playlistData);
        
        // Store AI analysis
        await this.storeAnalysis(playlistId, 'ai-analysis', result.analysis, 0.9);
  
        return {
          data: result.analysis,
          confidence: 0.9,
          tokensUsed: result.usage?.totalTokens || 0,
          cost: result.usage?.cost || 0
        };
  
      } catch (error) {
        console.error('AI analysis failed:', error);
        throw new Error(`AI analysis failed: ${error.message}`);
      }
    }
  
    /**
     * Get comprehensive analysis combining all methods
     */
    async getComprehensiveAnalysis(playlistId, videos = []) {
      try {
        const [topics, themes, difficulty, keywords] = await Promise.all([
          this.analyzeTopics(playlistId, videos),
          this.analyzeThemes(playlistId, videos),
          this.analyzeDifficulty(playlistId, videos),
          this.generateKeywords(playlistId, videos)
        ]);
  
        // Try AI analysis if available
        let aiAnalysis = null;
        if (this.aiClient) {
          try {
            aiAnalysis = await this.performAIAnalysis(playlistId, videos);
          } catch (error) {
            console.warn('AI analysis failed, using basic analysis:', error.message);
          }
        }
  
        return {
          topics: topics.data,
          themes: themes.data,
          difficulty: difficulty.data,
          keywords: keywords.data,
          aiAnalysis: aiAnalysis?.data || null,
          confidence: {
            topics: topics.confidence,
            themes: themes.confidence,
            difficulty: difficulty.confidence,
            keywords: keywords.confidence,
            aiAnalysis: aiAnalysis?.confidence || 0
          },
          analyzedAt: Date.now(),
          videoCount: videos.length
        };
  
      } catch (error) {
        console.error('Comprehensive analysis failed:', error);
        throw new Error(`Analysis failed: ${error.message}`);
      }
    }
  
    // === HELPER METHODS ===
  
    async getPlaylistData(playlistId) {
      return await this.db.prepare('SELECT * FROM playlists WHERE id = ?')
        .bind(playlistId).first();
    }
  
    getTopicPatterns() {
      return {
        technology: [
          'javascript', 'python', 'react', 'node', 'css', 'html', 'typescript',
          'programming', 'coding', 'development', 'software', 'web', 'mobile',
          'ai', 'machine learning', 'data science', 'cloud', 'aws', 'docker'
        ],
        science: [
          'physics', 'chemistry', 'biology', 'mathematics', 'calculus', 'algebra',
          'statistics', 'research', 'experiment', 'theory', 'analysis'
        ],
        business: [
          'marketing', 'sales', 'finance', 'management', 'strategy', 'entrepreneurship',
          'leadership', 'productivity', 'economics', 'accounting'
        ],
        creative: [
          'design', 'art', 'photography', 'video', 'music', 'creative', 'drawing',
          'illustration', 'animation', 'storytelling'
        ]
      };
    }
  
    getThemePatterns() {
      return [
        'tutorial', 'course', 'lesson', 'guide', 'workshop', 'masterclass',
        'bootcamp', 'training', 'lecture', 'demonstration', 'review'
      ];
    }
  
    extractTopicsFromText(text, topics, patterns) {
      const lowerText = text.toLowerCase();
      
      Object.entries(patterns).forEach(([category, keywords]) => {
        keywords.forEach(keyword => {
          if (lowerText.includes(keyword)) {
            topics.add(keyword);
          }
        });
      });
    }
  
    analyzeEducationalPatterns(titles) {
      const patterns = {
        tutorial: titles.filter(t => /tutorial|how to|guide/i.test(t)).length,
        lecture: titles.filter(t => /lecture|lesson|class/i.test(t)).length,
        demo: titles.filter(t => /demo|demonstration|example/i.test(t)).length,
        review: titles.filter(t => /review|overview|summary/i.test(t)).length
      };
  
      const themes = Object.entries(patterns)
        .filter(([, count]) => count > 0)
        .map(([pattern]) => pattern);
  
      return {
        themes,
        structure: patterns
      };
    }
  
    detectContentProgression(videos) {
      const progressionIndicators = [
        'part 1', 'part 2', 'episode', 'lesson', 'chapter',
        'intro', 'advanced', 'final', 'conclusion'
      ];
  
      const hasProgression = videos.some(video =>
        progressionIndicators.some(indicator =>
          video.title.toLowerCase().includes(indicator)
        )
      );
  
      return { hasProgression };
    }
  
    identifyInstructionalFormats(videos) {
      const formats = [];
      
      if (videos.some(v => /live|stream/i.test(v.title))) {
        formats.push('live-session');
      }
      
      if (videos.some(v => /q&a|questions/i.test(v.title))) {
        formats.push('qa-session');
      }
      
      if (videos.some(v => /hands.?on|practical/i.test(v.title))) {
        formats.push('hands-on');
      }
  
      return formats;
    }
  
    extractKeywords(text, keywords) {
      // Simple keyword extraction - remove common words
      const stopWords = new Set([
        'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'a', 'an', 'as', 'if', 'then', 'than', 'this', 'that', 'these', 'those'
      ]);
  
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
  
      words.forEach(word => keywords.add(word));
    }
  
    generateEducationalKeywords(videos) {
      const keywords = [];
      
      if (videos.length > 10) keywords.push('comprehensive');
      if (videos.length > 20) keywords.push('complete-course');
      
      const totalDuration = videos.reduce((sum, video) => {
        const duration = this.parseDuration(video.duration);
        return sum + duration;
      }, 0);
      
      if (totalDuration > 600) keywords.push('in-depth'); // > 10 minutes
      if (totalDuration > 3600) keywords.push('extensive'); // > 1 hour
  
      return keywords;
    }
  
    parseDuration(duration) {
      if (!duration) return 0;
      
      const parts = duration.split(':').map(Number);
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1]; // MM:SS
      } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
      }
      
      return 0;
    }
  
    filterKeywords(keywords) {
      return keywords.filter(kw => 
        kw.length > 2 && 
        kw.length < 30 && 
        !/^\d+$/.test(kw) // No pure numbers
      );
    }
  
    rankKeywords(keywords, videos) {
      // Simple ranking by frequency and relevance
      const counts = {};
      
      keywords.forEach(keyword => {
        counts[keyword] = videos.filter(video =>
          video.title.toLowerCase().includes(keyword) ||
          (video.description && video.description.toLowerCase().includes(keyword))
        ).length;
      });
  
      return Object.entries(counts)
        .sort(([,a], [,b]) => b - a)
        .map(([keyword]) => keyword);
    }
  
    rankTopics(topics, videos) {
      return this.rankKeywords(topics, videos);
    }
  
    isTechnicalKeyword(keyword) {
      const technical = ['programming', 'coding', 'development', 'api', 'database', 'algorithm'];
      return technical.some(t => keyword.includes(t));
    }
  
    isEducationalKeyword(keyword) {
      const educational = ['tutorial', 'guide', 'lesson', 'course', 'training', 'learning'];
      return educational.some(e => keyword.includes(e));
    }
  
    isTopicalKeyword(keyword) {
      return !this.isTechnicalKeyword(keyword) && !this.isEducationalKeyword(keyword);
    }
  
    getDefaultAnalysis(analysisType) {
      const defaults = {
        'topics': { topics: [], allTopics: [] },
        'themes': { themes: [], progression: { hasProgression: false } },
        'difficulty': { difficulty: 'intermediate', indicators: {} },
        'keywords': { keywords: [], allKeywords: [] },
        'ai-analysis': {}
      };
  
      return defaults[analysisType] || {};
    }
  
    /**
     * Clean expired analysis cache
     */
    async cleanExpiredCache() {
      try {
        const result = await this.db.prepare(`
          DELETE FROM content_analysis 
          WHERE expires_at < strftime('%s', 'now')
        `).run();
  
        return result.changes || 0;
      } catch (error) {
        console.error('Cache cleanup failed:', error);
        return 0;
      }
    }
  }
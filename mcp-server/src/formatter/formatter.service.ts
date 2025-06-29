import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export interface FormattedResponse {
  summary: string;
  formattedData: string;
  metadata: {
    dataType: string;
    itemCount?: number;
    categories?: string[];
    totalValue?: number;
  };
}

@Injectable()
export class FormatterService {
  private readonly logger = new Logger(FormatterService.name);
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Format API response data into user-friendly format using LLM
   */
  async formatApiResponse(data: any, originalQuery: string): Promise<FormattedResponse> {
    if (!data) {
      return {
        summary: "No data returned from the API",
        formattedData: "ℹ️ The request was successful but no data was returned.",
        metadata: { dataType: 'empty' }
      };
    }

    try {
      // Use LLM to format the response
      const formatted = await this.formatWithLLM(data, originalQuery);
      return formatted;
    } catch (error) {
      this.logger.error('LLM formatting failed, using fallback', error);
      return this.formatFallback(data, originalQuery);
    }
  }

  private async formatWithLLM(data: any, originalQuery: string): Promise<FormattedResponse> {
    const prompt = `You are a helpful assistant that formats API response data into user-friendly format.

User's original query: "${originalQuery}"

API Response Data:
${JSON.stringify(data, null, 2)}

Please format this data in a user-friendly way following these guidelines:
1. Create a brief summary (1-2 sentences) 
2. Format the data using markdown with appropriate headers, lists, and tables
3. Use emojis where appropriate to make it visually appealing
4. If it's an array, show the count and structure the data clearly
5. If it's an object, organize the information logically
6. Make it easy to read and understand for non-technical users
7. Don't include raw JSON in the formatted output
8. Focus on the most important information first

Respond with a JSON object in this exact format:
{
  "summary": "Brief summary of the data",
  "formattedData": "Markdown formatted data",
  "metadata": {
    "dataType": "array|object|primitive",
    "itemCount": (number if array),
    "totalValue": (number if there are monetary values)
  }
}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const responseText = completion.choices[0].message.content?.trim() || '';
    
    try {
      // Parse the JSON response from LLM
      const parsed = JSON.parse(responseText);
      
      // Validate the response structure
      if (!parsed.summary || !parsed.formattedData || !parsed.metadata) {
        throw new Error('Invalid LLM response structure');
      }

      return {
        summary: parsed.summary,
        formattedData: parsed.formattedData,
        metadata: {
          dataType: parsed.metadata.dataType || 'unknown',
          itemCount: parsed.metadata.itemCount,
          totalValue: parsed.metadata.totalValue
        }
      };
    } catch (parseError) {
      this.logger.error('Failed to parse LLM response as JSON', parseError);
      
      // If JSON parsing fails, treat the entire response as formatted text
      return {
        summary: "Data formatted successfully",
        formattedData: responseText,
        metadata: { dataType: 'formatted_text' }
      };
    }
  }

  private formatFallback(data: any, originalQuery: string): FormattedResponse {
    if (Array.isArray(data)) {
      return {
        summary: `📋 Found ${data.length} item${data.length !== 1 ? 's' : ''}`,
        formattedData: this.formatArrayFallback(data),
        metadata: { dataType: 'array', itemCount: data.length }
      };
    } else if (typeof data === 'object' && data !== null) {
      return {
        summary: "📄 Data retrieved successfully",
        formattedData: this.formatObjectFallback(data),
        metadata: { dataType: 'object' }
      };
    } else {
      return {
        summary: `✅ Result: ${data}`,
        formattedData: `**Result:** ${data}`,
        metadata: { dataType: 'primitive' }
      };
    }
  }

  private formatArrayFallback(data: any[]): string {
    let formatted = `## 📋 Results (${data.length})\n\n`;
    
    if (data.length <= 5) {
      data.forEach((item, index) => {
        formatted += `### Item ${index + 1}\n`;
        formatted += this.formatObjectAsKeyValue(item);
        formatted += '\n';
      });
    } else {
      formatted += `### Summary\n`;
      formatted += `- **Total Items:** ${data.length}\n\n`;
      formatted += `### Sample Items\n`;
      data.slice(0, 3).forEach((item, index) => {
        formatted += `**Item ${index + 1}:** ${this.getItemSummary(item)}\n`;
      });
      formatted += `\n*... and ${data.length - 3} more items*`;
    }

    return formatted;
  }

  private formatObjectFallback(data: any): string {
    let formatted = `## 📄 Data\n\n`;
    formatted += this.formatObjectAsKeyValue(data);
    return formatted;
  }

  private formatObjectAsKeyValue(obj: any): string {
    let result = '';
    Object.entries(obj).forEach(([key, value]) => {
      const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          result += `- **${formattedKey}:** ${value.length} items\n`;
        } else {
          result += `- **${formattedKey}:** ${JSON.stringify(value)}\n`;
        }
      } else {
        result += `- **${formattedKey}:** ${value}\n`;
      }
    });
    return result;
  }

  private getItemSummary(item: any): string {
    // Try to find a meaningful identifier
    if (item.name) return item.name;
    if (item.title) return item.title;
    if (item.id) return `ID: ${item.id}`;
    if (item.email) return item.email;
    
    // If object has few properties, show them
    const keys = Object.keys(item);
    if (keys.length <= 3) {
      return keys.map(key => `${key}: ${item[key]}`).join(', ');
    }
    
    return 'Item';
  }
} 
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { Skill } from './skill';
import { HumanChatMessage } from 'langchain/schema';
import { AgentTask } from '@/types';
import { t } from 'i18next';
import { setupMessage } from '@/utils/message';

export class textCompletion extends Skill {
  name = 'text_completion';
  description =
    "A tool that uses OpenAI's text completion API to generate, summarize, and/or analyze text and code.";
  apiKeysRequired = ['openai'];

  async execute(
    task: AgentTask,
    dependentTaskOutputs: any,
    objective: string,
  ): Promise<string> {
    if (!this.valid) return '';

    const taskPrompt = `Complete your assigned task based on the objective and only based on information provided in the dependent task output, if provided. \n###
    Your objective: ${objective}. \n###
    Your task: ${task} \n###
    Dependent tasks output: ${dependentTaskOutputs}  ###
    Your task: ${task}\n###
    RESPONSE:`;

    let chunk = '';
    const messageCallnback = this.messageCallback;
    const llm = new ChatOpenAI(
      {
        openAIApiKey: this.apiKeys.openai,
        modelName: 'gpt-3.5-turbo',
        temperature: 0.2,
        maxTokens: 800,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        streaming: true,
        callbacks: [
          {
            handleLLMNewToken(token: string) {
              chunk += token;
              messageCallnback?.(
                setupMessage('task-execute', chunk, undefined, '🤖', task.id),
              );
            },
          },
        ],
      },
      { baseOptions: { signal: null } },
    );

    try {
      const response = await llm.call([new HumanChatMessage(taskPrompt)]);
      //
      messageCallnback?.(
        setupMessage('task-output', response.text, undefined, '✅', task.id),
      );

      return response.text;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return `Task aborted.`;
      }
      console.log('error: ', error);
      return 'Failed to generate text.';
    }
  }
}

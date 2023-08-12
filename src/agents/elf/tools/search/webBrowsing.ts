import { simplifySearchResults } from '@/agents/common/tools/webSearch';
import { AgentTask, AgentMessage } from '@/types';
import { analystPrompt, searchQueryPrompt } from './prompt';
import { textCompletionTool } from '../textCompletionTool';
import { largeTextExtract } from './largeTextExtract';
import { v4 as uuidv4 } from 'uuid';
import { webSearch } from './webSearch';
import { webScrape } from '../webScrape';

export const webBrowsing = async (
  objective: string,
  task: AgentTask,
  dependentTasksOutput: string,
  messageCallback: (message: AgentMessage) => void,
  verbose: boolean = false,
  modelName: string = 'gpt-3.5-turbo',
  language: string = 'en',
) => {
  let id = uuidv4();
  const prompt = searchQueryPrompt(
    task.task,
    dependentTasksOutput.slice(0, 3500),
  );
  const searchQuery = await textCompletionTool(prompt, id, task, modelName);
  const trimmedQuery = searchQuery?.replace(/^"|"$/g, ''); // remove quotes from the search query

  let message = `Search query: ${trimmedQuery}\n`;
  callbackSearchStatus(id, message, task, messageCallback, verbose);
  const searchResults = await webSearch(trimmedQuery || '');
  if (!searchResults) {
    return 'Failed to search.';
  }

  const simplifiedSearchResults = simplifySearchResults(searchResults);
  message = `✅ Completed search. \nNow reading content.\n`;
  callbackSearchStatus(id, message, task, messageCallback, verbose);

  let results = '';
  let index = 1;
  let completedCount = 0;
  const MaxCompletedCount = 3;
  // Loop through search results
  for (const searchResult of simplifiedSearchResults) {
    if (completedCount >= MaxCompletedCount) break;

    // Extract the URL from the search result
    const url = searchResult.link;
    let title = `${index}. Reading: ${url} ...`;

    message = `${title}\n`;
    callbackSearchStatus(id, message, task, messageCallback, verbose);

    const content = await webScrape(url);
    if (!content) {
      let message = `  - Failed to read content. Skipped. \n`;
      callbackSearchStatus(id, message, task, messageCallback, verbose);
      continue;
    }

    title = `${index}. Extracting relevant info...`;
    message = `  - Content reading completed. Length:${content?.length}. Now extracting relevant info...\n`;
    callbackSearchStatus(id, message, task, messageCallback, verbose);

    if (content?.length === 0) {
      let message = `  - Content too short. Skipped. \n`;
      callbackSearchStatus(id, message, task, messageCallback, verbose);
      index += 1;
      continue;
    }

    message = `  - Extracting relevant information\n`;
    title = `${index}. Extracting relevant info...`;
    callbackSearchStatus(id, message, task, messageCallback, verbose);
    const info = await largeTextExtract(
      id,
      objective,
      content.slice(0, 20000),
      task,
      messageCallback,
    );

    message = `  - Relevant info: ${info
      .slice(0, 100)
      .replace(/\r?\n/g, '')} ...\n`;

    title = `${index}. Relevant info...`;
    callbackSearchStatus(id, message, task, messageCallback, verbose);

    results += `${info}. `;
    index += 1;
    completedCount += 1;
  }

  message = 'Analyzing results...\n';
  callbackSearchStatus(id, message, task, messageCallback, verbose);

  const outputId = uuidv4();
  const ap = analystPrompt(results, language);
  const analyzedResults = await textCompletionTool(
    ap,
    outputId,
    task,
    modelName,
    messageCallback,
  );

  // callback to search logs
  message = 'Completed analyzing results.';
  const msg: AgentMessage = {
    id,
    taskId: task.id.toString(),
    type: task.skill,
    content: message,
    title: task.task,
    style: 'log',
    status: 'complete',
  };
  messageCallback(msg);

  return analyzedResults;
};

const callbackSearchStatus = (
  id: string,
  message: string,
  task: AgentTask,
  messageCallback: (message: AgentMessage) => void,
  verbose: boolean = false,
) => {
  if (verbose) {
    console.log(message);
  }

  messageCallback({
    id,
    taskId: task.id.toString(),
    type: task.skill,
    icon: '🔎',
    style: 'log',
    content: message,
    title: task.task,
    status: 'running',
  });
};

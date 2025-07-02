document.addEventListener('DOMContentLoaded', () => {
  const codeEditor = document.getElementById('code-editor');
  const runCodeButton = document.getElementById('run-code');
  const codeOutput = document.getElementById('code-output');
  const chatInput = document.getElementById('chat-input');
  const sendMessageButton = document.getElementById('send-message');
  const conversationHistory = document.getElementById('conversation-history');
  const chatList = document.getElementById('chat-list');
  const newChatButton = document.getElementById('new-chat');
  const fileUpload = document.getElementById('file-upload');
  const uploadBtn = document.getElementById('upload-btn');
  const modelSelector = document.getElementById('model-selector');
  const apiBaseUrlInput = document.getElementById('apiBaseUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const saveSettingsBtn = document.getElementById('saveSettings');
  
  // Chat management
  let currentChatId = null;
  let chats = JSON.parse(localStorage.getItem('jscodegen-chats') || '{}');
  let uploadedFiles = {};
  
  // API Configuration
  let apiConfig = {
    baseUrl: localStorage.getItem('jscodegen-api-base-url') || 'https://llmfoundry.straive.com/openai/v1',
    apiKey: localStorage.getItem('jscodegen-api-key') || '',
    model: localStorage.getItem('jscodegen-selected-model') || 'gpt-4o-mini'
  };
  
  // Initialize syntax highlighting
  hljs.highlightAll();
  
  // Initialize systems
  initializeApiSettings();
  initializeChatSystem();
  
  // Legacy constants (now using dynamic apiConfig)
  // const API_URL = "https://llmfoundry.straive.com/openai/v1/chat/completions";
  // const DEFAULT_MODEL = "gpt-4o-mini";
  
  // System prompt for code generation
  const SYSTEM_PROMPT = `You are a JavaScript code generation assistant. Respond in two clearly separated parts:

  PART 1: EXPLANATION
  Provide a clear explanation of the approach, concepts, and techniques you'll use to solve the problem.
  Focus on explaining the logic and reasoning behind your solution.
  
  PART 2: CODE
  After your explanation, provide ONLY the executable JavaScript code inside a code block.
  Format your code like this:
  \`\`\`javascript
  // Your code here
  \`\`\`
  
  Your code must be complete, self-contained, and ready to run in a browser environment.
  Include helpful comments in your code to explain the logic.
  Do not repeat explanations in the code block - keep all explanations in Part 1. 
  For the query user asks, you must generate JS code only.`;
  
  // Run code button click handler
  runCodeButton.addEventListener('click', () => {
    executeCode();
  });
  
  // Execute code function
  function executeCode() {
    const code = codeEditor.value;
    // Clear output area before execution
    codeOutput.innerHTML = '';
    
    // Check if code contains document.body manipulation (indicates new page creation)
    const createsNewPage = code.includes('document.body.innerHTML') || 
                          code.includes('document.body.appendChild') ||
                          code.includes('document.body.style') ||
                          code.includes('document.body.removeChild');
    
    if (createsNewPage) {
      // Ask user if they want to open in new window
      const openInNewWindow = confirm('This code will modify the page content. Would you like to open it in a new window?');
      
      if (openInNewWindow) {
        executeInNewWindow(code);
        return;
      }
    }
    
    // Create a new console.log function to capture outputs
    const originalConsoleLog = console.log;
    const outputs = [];
    
    console.log = function(...args) {
      originalConsoleLog.apply(console, args);
      outputs.push(args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      }).join(' '));
    };
    
    try {
      // Execute the code and get the return value
      const result = eval(code);
      
      // Build output display
      let outputText = '';
      
      // If there were console.log outputs, show them
      if (outputs.length > 0) {
        outputText += 'Console Output:\n' + outputs.join('\n') + '\n\n';
      }
      
      // If there was a return value, show it
      if (result !== undefined) {
        outputText += 'Return Value:\n' + 
          (typeof result === 'object' ? 
            JSON.stringify(result, null, 2) : 
            String(result));
      }
      
      // If code modifies DOM, show notification
      if (createsNewPage) {
        outputText += '\n\n// Note: This code has modified the current page content.';
      }
      
      if (outputText === '') {
        outputText = '// Code executed successfully. No output or return value.';
      }
      
      codeOutput.textContent = outputText;
    } catch (error) {
      codeOutput.textContent = `Error: ${error.message}\n\nStack trace:\n${error.stack || 'No stack trace available'}`;
    } finally {
      // Restore original console.log
      console.log = originalConsoleLog;
    }
  }
  
  // Execute code in new window
  function executeInNewWindow(code) {
    const newWindow = window.open('', '_blank', 'width=800,height=600');
    
    if (!newWindow) {
      codeOutput.textContent = 'Error: Unable to open new window. Please allow popups for this site.';
      return;
    }
    
    // Create basic HTML structure for the new window
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Code Preview</title>
    <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    </style>
</head>
<body>
    <script>
        try {
            ${code}
        } catch (error) {
            document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;"><h3>Error:</h3><pre>' + error.message + '</pre></div>';
        }
    </script>
</body>
</html>`;
    
    newWindow.document.write(htmlContent);
    newWindow.document.close();
    
    // Show success message in output
    codeOutput.textContent = '✅ Code executed successfully in new window!\n\nThe generated page has been opened in a new browser tab/window.';
  }
  
  // Send message button click handler
  sendMessageButton.addEventListener('click', () => {
    sendMessage();
  });
  
  // Enter key in chat input sends message
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Extract code from LLM response using regex
  function extractCodeFromResponse(text) {
    const codeBlockRegex = /```(?:javascript|js)?\s*([\s\S]*?)```/;
    const match = text.match(codeBlockRegex);
    return match ? match[1].trim() : null;
  }
  
  // Extract explanation from LLM response (everything before the code block)
  function extractExplanationFromResponse(text) {
    const parts = text.split(/```(?:javascript|js)?/);
    return parts[0].trim();
  }
  
  // Add message to conversation history
  function addMessageToConversation(userMessage, assistantResponse, autoScroll = true) {
    // Remove initial placeholder if it exists
    const placeholder = conversationHistory.querySelector('.text-muted.text-center');
    if (placeholder) {
      placeholder.remove();
    }
    
    // Create message container
    const messageContainer = document.createElement('div');
    messageContainer.className = 'mb-4';
    
    // Create user message
    const userDiv = document.createElement('div');
    userDiv.className = 'bg-primary bg-opacity-10 border-start border-primary border-3 p-3 rounded mb-2';
    userDiv.innerHTML = `
      <div class="fw-bold mb-2 small text-body-emphasis">You asked:</div>
      <div class="text-body">${escapeHtml(userMessage)}</div>
      <div class="text-body-secondary small mt-2">${new Date().toLocaleTimeString()}</div>
    `;
    
    // Create assistant message
    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'bg-success bg-opacity-10 border-start border-success border-3 p-3 rounded';
    
    // Format assistant response with paragraphs
    const formattedResponse = assistantResponse
      .split('\n\n')
      .map(paragraph => `<p class="mb-2">${escapeHtml(paragraph)}</p>`)
      .join('');
    
    assistantDiv.innerHTML = `
      <div class="fw-bold mb-2 small text-body-emphasis">AI Assistant:</div>
      <div class="text-body">${formattedResponse}</div>
      <div class="text-body-secondary small mt-2">${new Date().toLocaleTimeString()}</div>
    `;
    
    // Add to container
    messageContainer.appendChild(userDiv);
    messageContainer.appendChild(assistantDiv);
    
    // Add to conversation history
    conversationHistory.appendChild(messageContainer);
    
    // Scroll to bottom only if autoScroll is true
    if (autoScroll) {
      conversationHistory.scrollTop = conversationHistory.scrollHeight;
    }
  }
  
  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Show loading state in conversation
  function showConversationLoading(userQuery) {
    // Remove initial placeholder if it exists
    const placeholder = conversationHistory.querySelector('.text-muted.text-center');
    if (placeholder) {
      placeholder.remove();
    }
    
    // Create loading message container
    const messageContainer = document.createElement('div');
    messageContainer.className = 'mb-4';
    messageContainer.id = 'loading-message';
    
    // Create user message
    const userDiv = document.createElement('div');
    userDiv.className = 'bg-primary bg-opacity-10 border-start border-primary border-3 p-3 rounded mb-2';
    userDiv.innerHTML = `
      <div class="fw-bold mb-2 small text-body-emphasis">You asked:</div>
      <div class="text-body">${escapeHtml(userQuery)}</div>
      <div class="text-body-secondary small mt-2">${new Date().toLocaleTimeString()}</div>
    `;
    
    // Create loading assistant message
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'bg-success bg-opacity-10 border-start border-success border-3 p-3 rounded';
    loadingDiv.innerHTML = `
      <div class="fw-bold mb-2 small text-body-emphasis">AI Assistant:</div>
      <div class="d-flex align-items-center text-body">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        <span>Generating explanation and code...</span>
      </div>
    `;
    
    // Add to container
    messageContainer.appendChild(userDiv);
    messageContainer.appendChild(loadingDiv);
    
    // Add to conversation history
    conversationHistory.appendChild(messageContainer);
    
    // Scroll to bottom
    conversationHistory.scrollTop = conversationHistory.scrollHeight;
  }
  
  // Send message function (now async to handle API calls)
  async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '') return;
    
    // Disable send button while processing
    sendMessageButton.disabled = true;
    
    // Show loading state
    showConversationLoading(message);
    
    // Clear input and output
    chatInput.value = '';
    codeOutput.innerHTML = '';
    
    try {
      // Call LLM API
      const response = await fetchLLMResponse(message);
      
      // Remove loading message
      const loadingMessage = document.getElementById('loading-message');
      if (loadingMessage) {
        loadingMessage.remove();
      }
      
      // Extract explanation and code
      const explanation = extractExplanationFromResponse(response.content);
      const code = extractCodeFromResponse(response.content);
      
      // Add to conversation history
      addMessageToConversation(message, explanation);
      
      if (code) {
        // Update code editor with generated code
        codeEditor.value = code;
        
        // Do NOT auto-run the code, let the user click the Run Code button
        // executeCode();
      }
      
      // Save to current chat with message history
      const chatTitle = message.length > 30 ? message.substring(0, 30) + '...' : message;
      addMessageToChat(message, response.content);
      updateCurrentChat(chatTitle, conversationHistory.innerHTML, codeEditor.value);
    } catch (error) {
      console.error("Error fetching LLM response:", error);
      
      // Remove loading message
      const loadingMessage = document.getElementById('loading-message');
      if (loadingMessage) {
        loadingMessage.remove();
      }
      
      // Show error in conversation
      const errorMessage = `Sorry, I encountered an error connecting to the AI service.

This could be due to:
• Network connectivity issues
• Temporary server unavailability  
• Browser QUIC protocol error

Try refreshing the page or try again in a moment. If using Chrome, you might need to disable QUIC protocol in chrome://flags if this persists.

Technical error: ${error.message}`;
      
      addMessageToConversation(message, errorMessage);
    } finally {
      // Re-enable send button
      sendMessageButton.disabled = false;
    }
  }
  
  // LLM API call function
  async function fetchLLMResponse(userPrompt) {
    try {
      // Get conversation history for context
      const messages = buildConversationHistory(userPrompt);
      
      // Build API URL
      const apiUrl = `${apiConfig.baseUrl}/chat/completions`;
      
      // Prepare headers
      const headers = { 
        "Content-Type": "application/json"
      };
      
      // Add Authorization header if API key is provided
      if (apiConfig.apiKey) {
        headers["Authorization"] = `Bearer ${apiConfig.apiKey}`;
      }
      
      // First attempt with configured settings
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: headers,
        credentials: apiConfig.apiKey ? "omit" : "include", // Use credentials only for services without API key
        body: JSON.stringify({
          model: apiConfig.model,
          messages: messages
        }),
        // Add cache control and timeout to avoid QUIC protocol issues
        cache: 'no-store',
        mode: 'cors',
        keepalive: true
      });
      
      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices[0].message;
    } catch (error) {
      console.error("API call error:", error);
      // Check if it's a QUIC protocol error and try again with a different approach
      if (error.message.includes("QUIC_PROTOCOL_ERROR") || error.message.includes("Failed to fetch")) {
        try {
          console.log("Retrying with alternative approach...");
          // Try again with a different approach to avoid QUIC protocol issues
          const retryResponse = await fetch(apiUrl, {
            method: "POST",
            headers: headers,
            credentials: apiConfig.apiKey ? "omit" : "include",
            body: JSON.stringify({
              model: apiConfig.model,
              messages: messages
            }),
            // Force to not use QUIC protocol
            cache: 'no-store',
            mode: 'cors',
            redirect: 'follow',
            referrerPolicy: 'no-referrer'
          });
          
          if (!retryResponse.ok) {
            throw new Error(`Retry API call failed with status: ${retryResponse.status}`);
          }
          
          const retryData = await retryResponse.json();
          return retryData.choices[0].message;
        } catch (retryError) {
          console.error("Retry API call error:", retryError);
          throw new Error(`Failed to connect to API server. Please check your network connection and try again.`);
        }
      }
      throw error;
    }
  }
  
  // Chat management functions
  function initializeChatSystem() {
    renderChatList();
    if (Object.keys(chats).length === 0) {
      createNewChat();
    } else {
      const latestChatId = Object.keys(chats).sort((a, b) => chats[b].lastUsed - chats[a].lastUsed)[0];
      switchToChat(latestChatId);
    }
    
    // Event listeners
    newChatButton.addEventListener('click', createNewChat);
    uploadBtn.addEventListener('click', () => fileUpload.click());
    fileUpload.addEventListener('change', handleFileUpload);
  }
  
  function createNewChat() {
    const chatId = 'chat_' + Date.now();
    const defaultCode = '// The AI will generate JavaScript code based on your prompts\n// This code will run in the browser when you click "Run Code"\n\n// Example:\nfunction helloWorld() {\n  const container = document.createElement(\'div\');\n  container.textContent = \'Hello, World!\';\n  document.body.appendChild(container);\n  return \'Element added to page\';\n}';
    
    const chat = {
      id: chatId,
      title: 'New Chat',
      messages: [],
      code: defaultCode,
      explanation: '',
      lastUsed: Date.now()
    };
    
    chats[chatId] = chat;
    saveChatData();
    
    // Reset UI to default state
    codeEditor.value = defaultCode;
    codeOutput.innerHTML = '';
    conversationHistory.innerHTML = '<div class="text-muted text-center fst-italic mt-4">Ask a question below to get an explanation and code example.</div>';
    
    switchToChat(chatId);
    renderChatList();
  }
  
  function switchToChat(chatId) {
    if (!chats[chatId]) return;
    
    currentChatId = chatId;
    const chat = chats[chatId];
    
    // Update UI
    const defaultCode = '// The AI will generate JavaScript code based on your prompts\n// This code will run in the browser when you click "Run Code"\n\n// Example:\nfunction helloWorld() {\n  const container = document.createElement(\'div\');\n  container.textContent = \'Hello, World!\';\n  document.body.appendChild(container);\n  return \'Element added to page\';\n}';
    
    codeEditor.value = chat.code || defaultCode;
    
    // Clear execution results when switching chats
    codeOutput.innerHTML = '';
    
    // Load conversation history
    loadConversationHistory(chat);
    
    // Update last used time
    chat.lastUsed = Date.now();
    saveChatData();
    renderChatList();
  }
  
  function loadConversationHistory(chat) {
    // Clear conversation history
    conversationHistory.innerHTML = '';
    
    if (!chat.messages || chat.messages.length === 0) {
      // Show initial placeholder
      conversationHistory.innerHTML = '<div class="text-muted text-center fst-italic mt-4">Ask a question below to get an explanation and code example.</div>';
      return;
    }
    
    // Display conversation pairs
    for (let i = 0; i < chat.messages.length; i += 2) {
      const userMessage = chat.messages[i];
      const assistantMessage = chat.messages[i + 1];
      
      if (userMessage && assistantMessage) {
        // Extract just the explanation part from assistant response
        const explanation = extractExplanationFromResponse(assistantMessage.content);
        addMessageToConversation(userMessage.content, explanation, false); // false = don't auto-scroll
      }
    }
  }
  
  function renderChatList() {
    const sortedChats = Object.values(chats)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 5);
    
    chatList.innerHTML = '';
    
    sortedChats.forEach(chat => {
      const chatItem = document.createElement('div');
      chatItem.className = `list-group-item list-group-item-action ${chat.id === currentChatId ? 'active' : ''}`;
      chatItem.style.cursor = 'pointer';
      
      const title = chat.title.length > 20 ? chat.title.substring(0, 20) + '...' : chat.title;
      const timeAgo = getTimeAgo(chat.lastUsed);
      
      chatItem.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1" style="min-width: 0;">
            <h6 class="mb-1 text-truncate">${title}</h6>
            <small class="text-muted">${timeAgo}</small>
          </div>
          <button class="btn btn-sm btn-outline-danger ms-2 delete-chat" data-chat-id="${chat.id}" title="Delete">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      `;
      
      chatItem.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-chat')) {
          switchToChat(chat.id);
        }
      });
      
      const deleteBtn = chatItem.querySelector('.delete-chat');
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteChat(chat.id);
      });
      
      chatList.appendChild(chatItem);
    });
  }
  
  function deleteChat(chatId) {
    if (Object.keys(chats).length === 1) {
      alert('Cannot delete the last remaining chat.');
      return;
    }
    
    if (confirm('Are you sure you want to delete this chat?')) {
      delete chats[chatId];
      saveChatData();
      
      if (currentChatId === chatId) {
        const remainingChats = Object.keys(chats);
        if (remainingChats.length > 0) {
          switchToChat(remainingChats[0]);
        } else {
          createNewChat();
        }
      }
      renderChatList();
    }
  }
  
  function saveChatData() {
    localStorage.setItem('jscodegen-chats', JSON.stringify(chats));
  }
  
  function updateCurrentChat(title, explanation, code) {
    if (currentChatId && chats[currentChatId]) {
      chats[currentChatId].title = title;
      chats[currentChatId].explanation = explanation;
      chats[currentChatId].code = code;
      chats[currentChatId].lastUsed = Date.now();
      saveChatData();
    }
  }
  
  function addMessageToChat(userMessage, assistantResponse) {
    if (currentChatId && chats[currentChatId]) {
      const chat = chats[currentChatId];
      
      // Add user message
      chat.messages.push({
        role: "user",
        content: userMessage,
        timestamp: Date.now()
      });
      
      // Add assistant response
      chat.messages.push({
        role: "assistant", 
        content: assistantResponse,
        timestamp: Date.now()
      });
      
      // Keep only last 6 messages (3 pairs of user-assistant)
      if (chat.messages.length > 6) {
        chat.messages = chat.messages.slice(-6);
      }
      
      saveChatData();
    }
  }
  
  function buildConversationHistory(currentUserPrompt) {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT }
    ];
    
    // Add previous messages from current chat for context
    if (currentChatId && chats[currentChatId] && chats[currentChatId].messages) {
      // Get the last 4 messages (2 pairs) to provide context
      const recentMessages = chats[currentChatId].messages.slice(-4);
      messages.push(...recentMessages);
    }
    
    // Add current user prompt
    messages.push({ role: "user", content: currentUserPrompt });
    
    return messages;
  }
  
  function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      const filename = file.name;
      
      uploadedFiles[filename] = content;
      
      // Add file context to chat input
      const currentValue = chatInput.value;
      const fileContext = `[File: ${filename}]\n${content}\n\n`;
      chatInput.value = fileContext + currentValue;
      
      // Show success message
      alert(`File "${filename}" uploaded successfully!`);
    };
    reader.readAsText(file);
    
    // Clear the file input
    fileUpload.value = '';
  }
  
  // API Settings Management
  function initializeApiSettings() {
    // Load saved settings into UI
    if (apiConfig.baseUrl) {
      apiBaseUrlInput.value = apiConfig.baseUrl;
    }
    if (apiConfig.apiKey) {
      apiKeyInput.value = apiConfig.apiKey;
    }
    if (apiConfig.model) {
      modelSelector.value = apiConfig.model;
    }
    
    // Event listeners
    saveSettingsBtn.addEventListener('click', saveApiSettings);
    modelSelector.addEventListener('change', updateSelectedModel);
    
    // Show warning if no API key is configured
    if (!apiConfig.apiKey && apiConfig.baseUrl !== 'https://llmfoundry.straive.com/openai/v1') {
      showApiKeyWarning();
    }
  }
  
  function saveApiSettings() {
    const baseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    
    if (!baseUrl) {
      alert('Please enter a valid API base URL');
      return;
    }
    
    // Update configuration
    apiConfig.baseUrl = baseUrl;
    apiConfig.apiKey = apiKey;
    
    // Save to localStorage
    localStorage.setItem('jscodegen-api-base-url', baseUrl);
    localStorage.setItem('jscodegen-api-key', apiKey);
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    modal.hide();
    
    // Show success message
    showToast('API settings saved successfully!', 'success');
  }
  
  function updateSelectedModel() {
    const selectedModel = modelSelector.value;
    apiConfig.model = selectedModel;
    localStorage.setItem('jscodegen-selected-model', selectedModel);
    showToast(`Model changed to ${selectedModel}`, 'info');
  }
  
  function showApiKeyWarning() {
    const warningToast = `
      <div class="toast-container position-fixed top-0 end-0 p-3">
        <div class="toast show" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="toast-header bg-warning">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <strong class="me-auto">API Configuration</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
          <div class="toast-body">
            Please configure your API settings using the gear icon in the navbar.
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', warningToast);
  }
  
  function showToast(message, type = 'info') {
    const toastId = 'toast-' + Date.now();
    const bgClass = type === 'success' ? 'bg-success' : type === 'error' ? 'bg-danger' : 'bg-info';
    const iconClass = type === 'success' ? 'bi-check-circle-fill' : type === 'error' ? 'bi-x-circle-fill' : 'bi-info-circle-fill';
    
    const toastHtml = `
      <div class="toast-container position-fixed top-0 end-0 p-3">
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
          <div class="toast-header ${bgClass} text-white">
            <i class="${iconClass} me-2"></i>
            <strong class="me-auto">Notification</strong>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
          </div>
          <div class="toast-body">
            ${message}
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    // Remove from DOM after hiding
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.parentElement.remove();
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const codeEditor = document.getElementById('code-editor');
  const runCodeButton = document.getElementById('run-code');
  const codeOutput = document.getElementById('code-output');
  const chatInput = document.getElementById('chat-input');
  const sendMessageButton = document.getElementById('send-message');
  const explanationContainer = document.getElementById('explanation-container');
  
  // Initialize syntax highlighting
  hljs.highlightAll();
  
  // LLM API configuration
  const API_URL = "https://llmfoundry.straive.com/openai/v1/chat/completions";
  const DEFAULT_MODEL = "gpt-4o-mini";
  
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
  Do not repeat explanations in the code block - keep all explanations in Part 1.`;
  
  // Run code button click handler
  runCodeButton.addEventListener('click', () => {
    executeCode();
  });
  
  // Execute code function
  function executeCode() {
    const code = codeEditor.value;
    // Clear output area before execution
    codeOutput.innerHTML = '';
    
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
      
      // If there were console.log outputs, show them
      if (outputs.length > 0) {
        codeOutput.innerHTML += outputs.join('\n') + '\n';
      }
      
      // If there was a return value, show it
      if (result !== undefined) {
        codeOutput.innerHTML += '// Return value: \n' + 
          (typeof result === 'object' ? 
            JSON.stringify(result, null, 2) : 
            String(result));
      }
      
      if (outputs.length === 0 && result === undefined) {
        codeOutput.textContent = '// No output';
      }
    } catch (error) {
      codeOutput.textContent = `Error: ${error.message}`;
    } finally {
      // Restore original console.log
      console.log = originalConsoleLog;
    }
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
  
  // Update explanation panel
  function updateExplanation(explanationText, userQuery) {
    // Create explanation elements
    const explanationContent = document.createElement('div');
    explanationContent.className = 'explanation-content';
    
    // Add user query as title
    const titleElement = document.createElement('div');
    titleElement.className = 'explanation-title';
    titleElement.textContent = userQuery;
    
    // Format explanation text with paragraphs
    const formattedExplanation = explanationText
      .split('\n\n')
      .map(paragraph => `<p>${paragraph}</p>`)
      .join('');
    
    // Set the HTML content
    explanationContent.innerHTML = formattedExplanation;
    
    // Clear and append to the explanation container
    explanationContainer.innerHTML = '';
    explanationContainer.appendChild(titleElement);
    explanationContainer.appendChild(explanationContent);
  }
  
  // Show loading state in explanation panel
  function showExplanationLoading(userQuery) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'explanation-content loading';
    loadingDiv.textContent = 'Generating explanation and code...';
    
    const titleElement = document.createElement('div');
    titleElement.className = 'explanation-title';
    titleElement.textContent = userQuery;
    
    explanationContainer.innerHTML = '';
    explanationContainer.appendChild(titleElement);
    explanationContainer.appendChild(loadingDiv);
  }
  
  // Send message function (now async to handle API calls)
  async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '') return;
    
    // Disable send button while processing
    sendMessageButton.disabled = true;
    
    // Show loading state
    showExplanationLoading(message);
    
    // Clear input and output
    chatInput.value = '';
    codeOutput.innerHTML = '';
    
    try {
      // Call LLM API
      const response = await fetchLLMResponse(message);
      
      // Extract explanation and code
      const explanation = extractExplanationFromResponse(response.content);
      const code = extractCodeFromResponse(response.content);
      
      // Update explanation panel
      updateExplanation(explanation, message);
      
      if (code) {
        // Update code editor with generated code
        codeEditor.value = code;
        
        // Do NOT auto-run the code, let the user click the Run Code button
        // executeCode();
      }
    } catch (error) {
      console.error("Error fetching LLM response:", error);
      // Show error in explanation panel with more helpful message
      explanationContainer.innerHTML = `
        <div class="explanation-title">${message}</div>
        <div class="explanation-content">
          <p>Sorry, I encountered an error connecting to the AI service.</p>
          <p>This could be due to:</p>
          <ul>
            <li>Network connectivity issues</li>
            <li>Temporary server unavailability</li>
            <li>Browser QUIC protocol error</li>
          </ul>
          <p>Try refreshing the page or try again in a moment. If using Chrome, you might need to disable QUIC protocol in chrome://flags if this persists.</p>
          <p><small>Technical error: ${error.message}</small></p>
        </div>
      `;
    } finally {
      // Re-enable send button
      sendMessageButton.disabled = false;
    }
  }
  
  // LLM API call function
  async function fetchLLMResponse(userPrompt) {
    try {
      // First attempt with default settings
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ]
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
          const retryResponse = await fetch(API_URL, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              model: DEFAULT_MODEL,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
              ]
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
});

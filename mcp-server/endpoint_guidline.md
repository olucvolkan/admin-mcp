MCP Server: Endpoint Prompt Generation and Intent Resolution Engine

Overview of the MCP Server Architecture

The MCP (Module Context Protocol) Server is designed to bridge natural language user requests with RESTful API calls. It enables an LLM-powered assistant to interpret user intents and execute the appropriate API endpoints on behalf of the user. Two core components facilitate this process: Endpoint Prompt Generation and the Intent Resolution Engine. By leveraging an OpenAPI specification of the available APIs, the system can automatically create natural-language descriptions of each endpoint and then match user queries to the best-fitting endpoint. This approach provides a natural language interface to APIs, eliminating the need for bespoke UI elements for each action and making the system more accessible and efficient ￼. In the following sections, we provide a detailed technical analysis of these components, including implementation suggestions, data schema design, and modular organization for maintainability.

Endpoint Prompt Generation

The Endpoint Prompt Generation component is responsible for ingesting an OpenAPI specification (uploaded to the MCP server) and producing a concise natural-language description for every API endpoint defined. Each description, or “endpoint prompt”, is a one-line prompt that clearly summarizes the purpose of the endpoint. These prompts are later used to match user intents to the correct API call.

OpenAPI Metadata Parsing

When an OpenAPI (Swagger) specification is uploaded, the system parses it to extract all relevant metadata for each endpoint. Endpoints are typically identified by an HTTP method (GET, POST, etc.) and a path (e.g. /users/{id} or /orders). For each endpoint, the following details are gathered from the spec:
	•	Summary and Description: A short summary and a longer description (if provided) explaining what the endpoint does. This textual documentation often directly indicates the endpoint’s purpose (e.g. “Retrieve the details of a user by ID” for GET /users/{id}).
	•	Parameters: Any input parameters the endpoint requires. This includes path parameters (e.g. {id} in /users/{id}), query parameters, and header parameters. For each parameter, the name, type, whether it’s required, and description are collected. For example, an endpoint might have a required query parameter status (string) to filter results.
	•	Request Body Schema: If the endpoint expects a JSON body (typically for POST/PUT/PATCH methods), the structure of that request body is analyzed. For instance, a POST /users endpoint might expect a JSON object with fields like name, email, etc., possibly with data types and descriptions for each.
	•	Response Schema: The structure of the successful response (e.g. a 200 OK response) is noted, including key fields the endpoint returns. This can hint at the outcome of the call (for example, the response schema might include an id field for a newly created resource, or an array of items for a list endpoint).

By compiling this metadata, the system has a comprehensive view of what each endpoint does, what inputs it needs, and what output it provides ￼. This forms the basis for prompt generation.

LLM-Based Prompt Synthesis

To ensure each endpoint prompt is clear and user-friendly, the MCP server uses a Large Language Model (LLM) to automatically generate the one-line description. The goal is to produce a sentence that precisely and succinctly describes the endpoint’s operation in natural language, as one might explain it to a user. This process takes into account all the metadata above.

Prompt construction: For each endpoint, the EndpointPromptGenerator module (conceptual class) constructs a prompt for the LLM that provides the endpoint’s details and asks for a single-sentence description. For example, the prompt to the LLM might look like:

“Generate a one-line description for the following API endpoint:
Method: POST
Path: /users
Summary: Create a new user account.
Description: Creates a new user in the system with the given details.
Request Body: JSON object with user fields (name, email, password).
Parameters: None other than the JSON body.
Response: Returns the created user object including its unique id.
Provide a concise natural language description of what this endpoint does.”

Given such input, an LLM (like GPT-4 or similar) can synthesize a prompt such as: “Creates a new user account with the provided name, email, and password, returning the new user’s ID and details.” This output combines the key information from summary, request body, and response into a single comprehensive line.

The LLM-based approach helps ensure the description is clear and human-friendly, possibly rephrasing technical jargon into plain language. It also maintains consistency in style across all endpoints. Notably, the summary provided in the OpenAPI spec often serves as a starting point, but the LLM can enrich it by including parameter or result context. This aligns with best practices for OpenAPI in LLM use: “LLMs rely significantly on natural language cues to determine the purpose of an endpoint. Avoid imprecise summaries like ‘submit request.’ Instead, use clear and descriptive phrasing” ￼. The generated prompt should explicitly state the action and target of the endpoint (e.g. “Create a new support ticket for a customer” rather than a vague “submit request”) ￼. By using the operation’s intent (create, retrieve, update, delete) and the object/resource involved, the one-liner becomes a descriptive operational summary of the endpoint.

Quality check: After generation, the prompt can be reviewed (automatically or manually) to ensure it’s accurate and truly one-line. The system might enforce a character limit or a single-sentence rule. If the OpenAPI spec already contains a well-written summary, the system might use it directly or still run it through the LLM for consistency. In cases where the summary is missing or too terse, the description and other details help the LLM produce a meaningful sentence.

Storing Endpoint Prompts

Once generated, each endpoint’s prompt is stored in a database table (e.g. endpoint_prompts). Each record in this table links an endpoint to its natural-language prompt. For example, the table schema might include:
	•	endpoint_id (foreign key to an endpoints table, or a composite of path and method if a separate table isn’t used)
	•	method (e.g. GET, POST)
	•	path (e.g. “/users/{id}”)
	•	prompt_text (the one-line description generated)
	•	(Optional) embedding_vector (if using semantic search, discussed below)
	•	(Optional) additional fields like api_id if multiple API specs or versions are managed.

Storing these prompts in a persistent table allows quick lookup and updates. If the OpenAPI spec changes or a new spec is uploaded, the EndpointPromptGenerator can detect new or modified endpoints and update the prompts accordingly. Versioning could be handled by linking prompts to a specific API specification version if needed.

In addition, precomputing a semantic embedding for each prompt at this stage greatly accelerates the intent resolution later. An embedding is a numeric vector representation of the text, capturing its meaning in a high-dimensional space. For instance, the prompt “Retrieve the latest sales metrics for a given region” would be converted into a vector in such a way that similar sentences (like “get recent sales stats by region”) end up close in vector space. Using an open-source model like Hugging Face’s all-MiniLM-L6-v2 (384-dimensional embeddings) or OpenAI’s embedding API ensures that even nuanced differences in phrasing are captured ￼. By storing these vectors (either in the database via a vector extension or in a dedicated vector index), the system can later perform rapid semantic similarity searches. This step is optional at generation time but is highly recommended for scaling the intent matching.

Summary: The output of the Endpoint Prompt Generation phase is a comprehensive list of endpoints, each with a machine-comprehensible and human-friendly one-line description. These serve as the catalog of capabilities that the LLM agent can invoke. As noted in industry guidance, having a centralized, discoverable catalog of API tools (endpoints) with clear descriptions allows both developers and AI agents to find and reuse existing APIs effectively ￼ – a crucial aspect for making the system “LLM-ready.”

Intent Resolution Engine

The Intent Resolution Engine is activated whenever a user submits a natural language request in the chat UI. Its job is to interpret the user’s intent and map it to one of the available API endpoints (using the prompts generated earlier), then formulate a plan to fulfill the request by calling that endpoint (or a sequence of endpoints). This component ensures that a user’s query like “Show me all pending orders from last week” is correctly translated into an API call (or calls) that retrieve the desired information or perform the desired action.

Matching User Queries to Endpoint Prompts

First, the engine must determine which endpoint (tool) best matches the user’s request. The IntentResolver module handles this by comparing the incoming user query (a text string) to the database of endpoint prompts.

There are two levels of matching implemented:
	•	Lexical Similarity Matching: A straightforward approach uses string similarity metrics or keyword matching. This could involve computing a fuzzy match score (e.g., Levenshtein distance or cosine similarity on TF-IDF vectors) between the user query and each prompt_text. For example, if the user query is “create a new user”, this would lexically match strongly with an endpoint prompt like “Creates a new user account with the provided details.” Lexical matching is fast and can catch obvious overlaps in wording.
	•	Semantic Similarity (Embedding) Matching: To go beyond exact wording and handle paraphrases or synonyms, the engine uses semantic embeddings. The user’s query is converted into an embedding vector using the same technique/model that was used for the endpoint prompts. It then computes the cosine similarity between this query vector and the stored embedding of each endpoint prompt. The endpoint whose description vector is closest to the query vector is considered the best semantic match. This allows correct mapping even if the wording differs. For instance, a query “list my orders placed this month” can correctly match an endpoint described as “Gets all orders for the current user within a specified date range,” even if they share few exact words. By encoding the meanings into vectors, the system achieves intent recognition that “transcends the limitations of simplistic keyword-based approaches” ￼.

In practice, the IntentResolver may use a combination of these methods. It could first filter or score by lexical cues (for efficiency) and then use embedding similarity for the fine ranking. Modern vector databases or libraries (like FAISS, Pinecone, or Postgres with PGVector) can be used to store embeddings and query the top-N most similar descriptions to a given query in milliseconds, even among thousands of endpoints.

Selecting the best match: The engine will typically pick the endpoint with the highest similarity score above a certain confidence threshold. If no score is high enough (meaning the user request doesn’t clearly match any known endpoint prompt), the system can handle this by either defaulting to a fallback (e.g., responding “I’m not sure how to help with that”) or by invoking a more complex reasoning (perhaps even asking an LLM to choose or clarify). In a well-maintained system with descriptive prompts, however, the correct endpoint should usually surface as the top match for a valid query, given that “NLP models match user intents with corresponding API endpoints accurately” when the endpoint descriptions are clear ￼.

For example, suppose the user types: “Show me recent orders”. The engine will compare this to the stored prompts. If one prompt reads “Retrieves the latest orders for a customer account”, the semantic match will likely be strong. Indeed, a properly designed endpoint prompt (like “Retrieve the latest sales orders for a given customer.”) would ensure that a prompt “show me recent orders” maps correctly to the GET /orders (or similar) endpoint ￼. This example highlights why the prompt generation phase is critical – good descriptions result in reliable intent matching.

Building a Request Plan

Once an endpoint is selected, the Intent Resolution Engine formulates a Request Plan for executing the API call. This is handled by a RequestPlanner module. The request plan is essentially a structured blueprint of how to fulfill the user’s intent using one or more API calls. It typically includes:
	•	Endpoint and Method: The specific API endpoint to call, including the HTTP method. For example, Endpoint: /orders, Method: GET. This comes directly from the matched endpoint.
	•	Parameter Assignment: A list of required inputs for the call and their values. The planner looks at the endpoint’s parameter definitions (from the OpenAPI data) to determine what must be supplied:
	•	Path Parameters: If the endpoint path has placeholders (e.g. /users/{id}), the planner must provide a value for each. It will attempt to extract these from the user’s query. For instance, if the user said “get details for user 42”, the number “42” can be parsed and assigned to the {id} path parameter. Some basic NLP or regex matching might be used (e.g. if the query contains a number and the parameter is of type integer and named id/userId, it’s a likely match).
	•	Query Parameters: If certain query params are required (e.g. start_date for a date range), the planner similarly tries to find a mention in the query (like “last week” might map to a start and end date). If it’s ambiguous or not provided, the planner might either use a default, or mark this as needing clarification.
	•	Request Body: For endpoints that require a JSON body (POST/PUT), the planner must construct this body from the user’s input. For example, if the user says “add a user named Alice with email alice@example.com”, the planner would create a JSON object {"name": "Alice", "email": "alice@example.com"} as the request body. This may involve extracting entities from the sentence. In complex cases, an additional LLM call can be made here: for example, to transform a natural language description of an object into a JSON according to the schema. Alternatively, the system can define a JSON template from the OpenAPI schema and fill in values that it recognized in the user query.
	•	Headers/Auth: If the API requires certain headers or auth tokens (aside from the user’s session, which is handled separately), the planner includes those. Generally, if authentication is needed, the system relies on the user’s current session (discussed below in Execution).
	•	Multi-step Actions: The plan can contain multiple API calls if the user’s request logically requires more than one step. This is an advanced capability of the planner:
	•	Sequential calls: e.g., “Create a new order and then get its status.” The engine may identify that this involves first calling the POST /orders endpoint, then using the returned order_id to call GET /orders/{order_id}/status. In the plan, this would be represented as two steps: Step 1 with the first call, Step 2 with the second call dependent on Step 1’s result (the order_id). The planner knows from the OpenAPI spec that the creation endpoint returns an ID (by checking the response schema), and that the status endpoint requires that ID.
	•	Parallel or conditional calls: typically, most user intents map to a single call or a simple sequence. The planner can be kept simple initially by focusing on straightforward sequential plans. Each step in the plan will note what to do with the response (e.g., “capture id from response of Step 1 to use in Step 2’s path”). This ensures the plan can be executed correctly in sequence.
	•	Response Handling Instructions: While not always explicitly represented in the plan data structure, the engine implicitly handles how to deal with the response. For example, if the endpoint returns data that the user expects to see, the final step would be to present that data (possibly formatted nicely) back to the user. If the endpoint call is part of a larger workflow (like just creating a resource for later use), the engine might summarize the outcome (e.g., “Order created successfully with ID 12345”). In case of a multi-step plan, intermediate responses might not be shown to the user except if needed. The plan might include notes like “after Step 1, take output X and use it in Step 2”, as described. This can be considered rudimentary response handling logic in the plan.

The RequestPlanner component can be implemented as a class that, given an Endpoint (from the match) and the original user_query, returns a structured plan. For example, the plan could be a Python dictionary or object like:

{
  "steps": [
    {
      "endpoint": "/orders",
      "method": "POST",
      "params": {},
      "body": {"product_id": 1001, "quantity": 2}, 
      "save_response": {"order_id": "$.id"}
    },
    {
      "endpoint": "/orders/{id}/status",
      "method": "GET",
      "params": {"id": "$.steps[0].order_id"},
      "body": null,
      "save_response": null
    }
  ]
}

This illustrates a two-step plan in JSON, where $.steps[0].order_id indicates “use the order_id from step 0’s response”. In many cases, the plan will have just one step.

Executing the Constructed Request

With a request plan in hand, the final phase is to execute the API call(s) and fulfill the user’s request. The MCP server, however, must do this using the current user’s browser session – meaning it should leverage the user’s existing authentication context rather than any stored credentials on the server. This design choice (no token storage on the server) enhances security and simplifies credential management.

Using the user’s session: Since the user is likely already authenticated in the web application (for example, the user might be logged into the service whose API we are calling), the MCP server can utilize that session for API calls. There are a few ways to achieve this:
	•	If the MCP server is part of the same domain or allowed to act on behalf of the user, it might have access to a session token or cookie that the user’s browser provides. For instance, the user’s browser might include a session cookie (JWT or session ID) with any request to the MCP server, which the MCP server can forward in the API call. In practice, the MCP server could extract authentication cookies from the incoming request context and attach them when making the API request to the target endpoint. This way, the API call carries the user’s identity and privileges, just as if the browser made it directly.
	•	Alternatively, if direct cookie forwarding is not possible (due to domain differences or design choices), the system might require the user to provide an API token at runtime (or perform an OAuth flow). However, instead of storing this token in a database, the token can be kept in memory or in the user’s session store and used only for the duration of the session or the specific request. The key is that no long-lived credential is persistently stored by the MCP server. Each call uses whatever credential is present in the user’s session context.

This approach is similar in spirit to designs for tool-integrations where the user is prompted to authenticate and the credentials are passed on-the-fly. For example, one approach is to have the user perform an OAuth login in their browser and then pass an instruction or token back to the assistant for immediate use ￼. The MCP server can implement a simpler variant: rely on the fact the user is already logged in and piggyback on that session.

Request execution implementation: The actual execution can be done with a standard HTTP client (e.g., Python’s requests library or Node’s fetch in a server context). The RequestExecutor (which could be a responsibility of the RequestPlanner or a separate helper module) will iterate through the steps of the plan:
	1.	For each step, construct the full URL (by injecting any path parameters into the endpoint path, e.g. replace {id} with the actual ID value).
	2.	Attach query parameters and serialize the request body (for JSON, convert the object to a JSON string).
	3.	Include authentication headers or cookies from the user’s session.
	4.	Send the HTTP request to the API endpoint.
	5.	Receive the response. If the step has a save_response instruction (like capturing an id), extract the needed data from the JSON result (e.g. parse JSON and get the field).
	6.	Proceed to the next step, injecting any saved data into that call.

If any step returns an error (non-2xx HTTP status), the executor should handle it. Depending on design, it might abort the plan and return an error message to the user (possibly with some friendly explanation), or attempt some form of recovery. In an advanced scenario, an LLM could even analyze the error and decide to adjust the plan or ask the user for more info, but initially a simple failure propagation is fine.

No credential storage: It’s worth emphasizing the security posture here: because each request is executed with the live session context, there’s no need to store sensitive API keys or passwords in the MCP server’s database. This minimizes the risk of leaks. Should the user’s session expire or lack permissions, the API call would simply fail and that result can be communicated to the user (or the user can be prompted to re-authenticate). This design aligns with emerging patterns where authentication is handled outside the tool integration protocol, maintaining security by not giving the LLM or intermediate system long-term access to user accounts ￼.

Modular Design for Maintainability

The above functionality is cleanly separated into modules, each with a clear responsibility, allowing for easier maintenance and possible extension:
	•	EndpointPromptGenerator: A module or class responsible for parsing the OpenAPI spec and generating endpoint prompts. It could provide a method like generate_prompts(spec) which returns or saves the prompts. Internally, it may use an LLM service for generation. This component can be developed and tested in isolation – for example, given a snippet of OpenAPI for one endpoint, verify that it produces an accurate one-line description.
	•	IntentResolver: This module handles user query intake and endpoint matching. A method like resolve_intent(user_query) would return the best-matching endpoint (or a structured object containing the endpoint and matching score). It will encapsulate the logic for similarity search. By abstracting this, one can swap out the matching strategy (for example, use a more advanced semantic search service, or incorporate business rules) without affecting other parts of the system. The IntentResolver will rely on the data prepared by EndpointPromptGenerator (the prompt texts and possibly embeddings). Notably, because the endpoints and their prompts are relatively static (only change when APIs update), the heavy work of embedding them is done upfront. The IntentResolver at runtime can use efficient nearest-neighbor queries to find matches quickly ￼.
	•	RequestPlanner: Given an identified endpoint and the user’s request (and possibly the raw OpenAPI details of that endpoint), this module formulates the call(s) needed. It may expose methods like plan_request(endpoint, user_query) -> returns a RequestPlan. This is where the parameter mapping and multi-step logic resides. By isolating this, the system can handle simple one-call plans now, and later evolve to handle more complex multi-call workflows without touching the matching logic. The planner could also incorporate some templating system or even LLM-based reasoning for complex cases (like converting a natural language date “last week” into actual date range parameters).
	•	RequestExecutor: (This could be part of the planner or separate) Responsible for taking a RequestPlan and actually performing the HTTP calls, managing authentication context. As a separate component, it could also log the outcomes, handle errors uniformly, etc. This could be as simple as a function that takes the plan and returns the final result (or an error), but designing it as a module allows adding features like retries, rate-limit handling, logging, and instrumentation in one place.

The components above interact in a pipeline: OpenAPI spec -> [EndpointPromptGenerator] -> endpoint_prompts DB -> [IntentResolver] -> matched endpoint -> [RequestPlanner] -> request plan -> [RequestExecutor] -> API calls and result. Each part can be unit-tested and improved independently. For example, if the matching isn’t accurate enough, one can improve the embeddings or add synonyms; if the prompt generation is slow, one can cache results or refine the LLM prompt.

Data Storage and Schema Considerations

The system will maintain some persistent data to support these features:
	•	Endpoints Table: It could be useful to have an endpoints table that stores each endpoint’s details (method, path, maybe operationId, etc.) as parsed from the OpenAPI spec. This is essentially a catalog of available API calls. Primary key might be a composite of method+path or a generated ID.
	•	EndpointPrompts Table: As noted, this table stores the natural language prompt for each endpoint (likely linking to the endpoints table via a foreign key). It may also store the embedding vector for semantic search. If using a relational database like PostgreSQL, one could use the VECTOR column type (provided by the PGVector extension) to store embeddings and even perform similarity search in SQL. Alternatively, a separate vector store can be maintained; in that case the table might store just the prompt text and an ID, and the vector is stored in an external index keyed by that ID.
	•	Conversation or Request Log: Although not explicitly asked, many implementations keep a log of user queries and the chosen endpoint and results. This can be useful for monitoring (and for improving the system via feedback). For example, a table request_logs(user_id, query, endpoint_id, success, timestamp, etc.). This can help detect if certain intents are not being matched correctly (if users frequently try some query and the system picks wrong endpoint or fails, developers can notice and adjust prompts or matching logic).

Implementation Suggestions and Future Enhancements
	1.	Embedding Model Selection: For semantic search, using an open-source model like all-MiniLM-L6-v2 (Sentence Transformers) is a good trade-off between performance and accuracy ￼. It yields 384-dimension vectors and is lightweight enough to run quickly. If infrastructure allows, OpenAI’s text-embedding-ada-002 could be used for possibly higher-quality embeddings (768-d or 1536-d vector) – though it introduces an external dependency and cost. The system should be designed to easily plug in different embedding providers. One approach is to have the EndpointPromptGenerator call an embedding function for each prompt (abstracted behind an interface), and likewise the IntentResolver uses the same for queries. This way, one can toggle between local embedding vs API embedding by configuration.
	2.	Similarity Threshold and Multiple Matches: It’s wise to define a similarity score threshold. If the top match is below this threshold, the system might conclude the intent doesn’t match any known tool directly. In such cases, the assistant could respond with a clarification question (“I’m not sure what you need. Could you rephrase or provide more details?”) rather than guessing. Another strategy is to take the top N matches and either choose the best or present options. However, in a conversational agent context, asking the user to pick from a list of endpoints is usually not ideal (defeats the purpose of natural interface). Instead, an LLM could be used in a secondary step: feed it the user query and the top 2-3 endpoint descriptions and ask it which is the best fit. This hybrid approach can resolve edge cases where semantic search is uncertain.
	3.	Parameter Extraction via LLM: For complex parameter filling, one can leverage LLMs as well. For example, the RequestPlanner might call an LLM with a prompt: “The user asked: ‘Get me all orders from last week’. The endpoint requires a start_date and end_date parameter. Extract the appropriate dates for last week.” The LLM could output concrete dates which the planner then uses. This dynamic can be especially powerful for translating relative dates (“last week”) or natural expressions (“high priority issues”) into exact values (date ranges, enum values etc.). It essentially adds a layer of understanding for parameter values beyond simple string matching.
	4.	Chaining and Memory: As the user continues to chat, the system could allow the conversation to influence parameters. For instance, if the user first asks “Create a new ticket for customer X” and then says “Update it to high priority”, the second query should ideally know “it” refers to the ticket just created. Implementing this requires storing the context (the result of the first API call, like the ticket ID) in the conversation state. The Intent Resolution Engine could then recognize that “it” refers to the last created resource and pass that into the planner. This moves towards a full agent memory, but is a possible future improvement once the basic pipeline is in place.
	5.	Error Handling and User Feedback: The system should gracefully handle errors. For example, if an API call returns a 400 or 500 error, the assistant can catch that and present a user-friendly message (“Sorry, I couldn’t retrieve the orders due to an unexpected error.”). The planner or executor might also include logic to handle authentication errors specifically – e.g., if a 401 Unauthorized is returned, the system might prompt the user to log in or refresh credentials. This ties into the earlier “auth URL” concept where the user might need to perform an OAuth flow and provide new tokens ￼, but in a simpler scenario, it might just mean the session expired.
	6.	Security Considerations: Ensure that the user’s query is properly sanitized or constrained before being used in any API call parameters, to prevent injection attacks or misuse of the API beyond what the user should do. Since the system is effectively executing user intentions on live APIs, it should enforce that only allowed endpoints are called and only with parameters of proper type/format (the OpenAPI spec can be used for validation here). This is especially important if the user can craft a query that might trick the system into calling an endpoint they shouldn’t (though if they have access via the API anyway, it might be okay, but still worth gating roles if needed).
	7.	Testing with Semantic Cases: Finally, as part of development, incorporate semantic testing of the endpoint prompts ￼. For each endpoint prompt, one can devise a few phrasings a user might use and test that the IntentResolver indeed matches them to the correct endpoint. This can be automated by storing example utterances and expected endpoint mappings, ensuring the embeddings and prompt quality are truly effective. This kind of testing will verify that the system is “LLM-ready” in the sense that the natural language cues (prompts) and matching logic produce correct API selections for a variety of phrasings.

Conclusion

The MCP Server’s design combines automated documentation with intelligent query interpretation to create a powerful natural language interface for APIs. The Endpoint Prompt Generation ensures every API capability is summarized in a way an LLM (and a human) can understand, condensing the OpenAPI spec into a set of actionable prompts. The Intent Resolution Engine then connects the dots from a user’s free-form request to the correct API call, planning out the execution steps required to serve that request. By using semantic search techniques, the system moves beyond brittle keyword matching to a more robust understanding of intent ￼, and by leveraging the user’s existing session for execution, it maintains security without sacrificing convenience.

This modular approach (EndpointPromptGenerator, IntentResolver, RequestPlanner, etc.) is both extensible and maintainable. New APIs can be integrated simply by uploading their OpenAPI spec and generating prompts. Changes in API (new parameters or endpoints) would be picked up through re-generation and not require manual code changes in the intent logic. As a result, the MCP server can serve as a general framework for turning any OpenAPI-described service into a conversational agent, allowing users to invoke complex workflows with simple natural language – fulfilling the vision of Natural Language to REST integration in a practical, secure manner ￼ ￼.

Sources:
	1.	Bin Wang, “Use OpenAPI Instead of MCP for LLM Tools” – Discussion on integrating OpenAPI-described tools with LLMs and handling authentication ￼.
	2.	Timothy Mugayi, “Unlocking the Power of Natural Language With OpenAPI And ChatGPT” – Describes how ChatGPT plugins use OpenAPI specs to map natural language to API calls (Better Programming, 2023) ￼.
	3.	GetAmbassador Blog, “Automate AI Workflows with OpenAPI to Build LLM-Ready APIs” – Best practices for making APIs understandable to LLM agents, emphasizing clear endpoint descriptions and semantic testing ￼ ￼.
	4.	Engineering at Zafin, “Bridging the Gap: Natural Language to interact with Complex Systems” – Case study on NL to REST, using OpenAPI metadata, embedding endpoints with MiniLM for semantic similarity, and clustering for intent matching ￼ ￼.
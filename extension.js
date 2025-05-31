// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TYPES = ['int', 'string', 'float', 'file', 'void', 'int[]', 'string[]', 'float[]'];

// Regexes (global for helper)
const classRegexGlobal = /class\s+([A-Za-z_][A-Za-z0-9_]*)/; // Renamed to avoid conflict
const funcRegexGlobal = /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*(\[\])?)/;
const macroRegexGlobal = /macro\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;
const includeRegexGlobal = /include\s+([A-Za-z_][A-Za-z0-9_.]*(@[A-Za-z_][A-Za-z0-9_]*)?)/;
const functionCallRegexGlobal = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/; // Regex to detect function calls

// Global symbol registry to store symbols for autocomplete
const globalSymbolRegistry = {
	// Map of document URI string to document symbols
	documentSymbols: new Map(),
	
	// Get symbols for a document
	getSymbolsForDocument(documentUri) {
		const uri = documentUri.toString();
		return this.documentSymbols.get(uri) || {
			classes: [], 
			functions: [], 
			macros: [], 
			variables: [],
			importedSymbols: { classes: [], macros: [], functions: [] }
		};
	},
	
	// Set symbols for a document
	setSymbolsForDocument(documentUri, symbols) {
		const uri = documentUri.toString();
		this.documentSymbols.set(uri, symbols);
	},
	
	// Clear symbols for a document
	clearSymbolsForDocument(documentUri) {
		const uri = documentUri.toString();
		this.documentSymbols.delete(uri);
	}
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Output to console that the extension is now active
	console.log('Pangy Language Support is now active');

	// Register the completion provider for Pangy files
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		'pangy',
		{
		provideCompletionItems(document, position) {
				const linePrefix = document.lineAt(position).text.substr(0, position.character);
				
				// Create completion items for different contexts
				const items = [];
				
				// Keywords
				const keywords = [
					'if', 'else if', 'else', 'loop', 'stop', 'return',
					'include', 'class', 'def', 'static', 'var', 'public', 
					'private', 'macro', 'this'
				];
				
				keywords.forEach(keyword => {
					const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
					items.push(item);
				});
				
				// Types
				const types = ['int', 'string', 'void', 'float', 'file', 'int[]', 'string[]', 'float[]'];
				
				types.forEach(type => {
					const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter);
					items.push(item);
				});
				
				// Built-in functions
				const builtins = [
					'print', 'input', 'to_int', 'to_string', 'to_stringf', 'to_intf',
					'append', 'pop', 'length', 'index', 'open', 'write', 'read', 'close'
				];
				
				builtins.forEach(func => {
					const item = new vscode.CompletionItem(func, vscode.CompletionItemKind.Function);
					item.detail = 'Built-in function';
					switch(func) {
						case 'print':
							item.documentation = 'Prints values to the console';
							break;
						case 'input':
							item.documentation = 'Reads a line of input from the user';
							break;
						case 'to_int':
							item.documentation = 'Converts a string to an integer';
							break;
						case 'to_string':
							item.documentation = 'Converts a value to a string';
							break;
						case 'to_stringf':
							item.documentation = 'Converts a float to a string';
							break;
						case 'to_intf':
							item.documentation = 'Converts a float to an integer';
							break;
						case 'append':
							item.documentation = 'Appends a value to an array';
							break;
						case 'pop':
							item.documentation = 'Removes and returns the last element of an array';
							break;
						case 'length':
							item.documentation = 'Returns the length of an array';
							break;
						case 'index':
							item.documentation = 'Returns the index of a value in an array';
							break;
						case 'open':
							item.documentation = 'Opens a file and returns a file pointer';
							break;
						case 'write':
							item.documentation = 'Writes to a file';
							break;
						case 'read':
							item.documentation = 'Reads from a file';
							break;
						case 'close':
							item.documentation = 'Closes a file';
							break;
					}
					items.push(item);
				});
				
				// Get the symbol table for this document
				const symbolTable = globalSymbolRegistry.getSymbolsForDocument(document.uri);
				
				// Determine context for more accurate suggestions
				const isClassContext = linePrefix.includes('class ');
				const isFunctionContext = linePrefix.includes('def ');
				const isVarContext = linePrefix.includes('var ');
				const isMacroContext = linePrefix.includes('macro ');
				const isIncludeContext = linePrefix.match(/include\s+\S*$/); // After "include", suggesting modules
				const isTypeContext = linePrefix.match(/var\s+\w+\s*$/); // After variable name, expecting type
				const isMethodCallContext = linePrefix.match(/\.\w*$/); // After a dot, suggesting method
				const isClassUsageContext = linePrefix.match(/\s+[A-Z]\w*\s*$/); // Typing a class name
				
				// Special handling for include statements
				if (isIncludeContext) {
					// Try to find library paths
					const pangyLibsDir = path.join(os.homedir(), '.pangylibs');
					const documentDir = path.dirname(document.uri.fsPath);
					
					try {
						if (fs.existsSync(pangyLibsDir)) {
							const includePrefix = linePrefix.trim().substring('include '.length);
							const parts = includePrefix.split('.');
							
							// If we have a partial path, look for matching modules
							if (parts.length === 1) {
								// Suggest top-level modules in .pangylibs and current directory
								const files = fs.readdirSync(pangyLibsDir);
								const currentDirFiles = fs.readdirSync(documentDir);
								
								// Combine files from both directories
								const allFiles = [...new Set([...files, ...currentDirFiles])];
								
								// Find potential modules (either .pgy files or directories)
								allFiles.forEach(file => {
									if (file.endsWith('.pgy')) {
										// Suggest module from .pgy file
										const moduleName = file.substring(0, file.length - 4);
										if (moduleName.startsWith(parts[0])) {
											const item = new vscode.CompletionItem(moduleName, vscode.CompletionItemKind.Module);
											item.detail = 'Module';
											item.documentation = 'Pangy module';
											items.push(item);
										}
									} else if (fs.statSync(path.join(pangyLibsDir, file)).isDirectory()) {
										// Suggest directory as a module namespace
										if (file.startsWith(parts[0])) {
											const item = new vscode.CompletionItem(file, vscode.CompletionItemKind.Module);
											item.detail = 'Module namespace';
											item.documentation = 'Pangy module namespace';
											items.push(item);
										}
									}
								});
							} else if (parts.length > 1) {
								// We're in a module path, suggest submodules or classes
								const lastPartPrefix = parts[parts.length - 1];
								const parentPath = parts.slice(0, parts.length - 1).join('.');
								
								// Look in common library paths
								const possiblePaths = [
									path.join(pangyLibsDir, parts.slice(0, parts.length - 1).join(path.sep)),
									path.join(documentDir, parts.slice(0, parts.length - 1).join(path.sep)),
									path.join(pangyLibsDir, parts[0]),
									path.join(documentDir, parts[0]),
								];
								
								for (const dirPath of possiblePaths) {
									if (fs.existsSync(dirPath)) {
										try {
											// If it's a directory, suggest submodules
											if (fs.statSync(dirPath).isDirectory()) {
												const files = fs.readdirSync(dirPath);
												files.forEach(file => {
													if (file.startsWith(lastPartPrefix)) {
														if (file.endsWith('.pgy')) {
															// Suggest module from .pgy file
															const moduleName = file.substring(0, file.length - 4);
															const item = new vscode.CompletionItem(moduleName, vscode.CompletionItemKind.Module);
															item.detail = 'Module';
															item.documentation = 'Pangy module';
															items.push(item);
														} else if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
															// Suggest directory as a module namespace
															const item = new vscode.CompletionItem(file, vscode.CompletionItemKind.Module);
															item.detail = 'Module namespace';
															item.documentation = 'Pangy module namespace';
															items.push(item);
														}
													}
												});
											}
											
											// If it's a file, try to extract class names
											else if (fs.statSync(dirPath + '.pgy').isFile()) {
												const fileContent = fs.readFileSync(dirPath + '.pgy', 'utf8');
												const classMatches = fileContent.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)/g) || [];
												classMatches.forEach(match => {
													const className = match.substring(6).trim();
													if (className.startsWith(lastPartPrefix)) {
														const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
														item.detail = 'Class';
														item.documentation = `Class from ${path.basename(dirPath)}.pgy`;
														items.push(item);
													}
												});
											}
										} catch (error) {
											// Ignore errors during autocompletion
										}
									}
								}
							}
						}
					} catch (error) {
						// Ignore errors during autocompletion
					}
					
					return items; // Return early with include suggestions
				}
				
				// Add completions from symbol table based on context
				// 1. Class names for type contexts or class usage
				if (isTypeContext || isClassUsageContext) {
					// Add classes from current file and imports
					symbolTable.classes.forEach(cls => {
						const item = new vscode.CompletionItem(cls.name, vscode.CompletionItemKind.Class);
						item.detail = `class ${cls.name}`;
						item.documentation = `Class defined in this file`;
						items.push(item);
					});
					
					symbolTable.importedSymbols.classes.forEach(cls => {
						const item = new vscode.CompletionItem(cls.name, vscode.CompletionItemKind.Class);
						item.detail = `class ${cls.name}`;
						item.documentation = `Imported class from ${path.basename(cls.sourceFile)}`;
						items.push(item);
					});
				}
				
				// 2. Function names for function calls
				if (!isClassContext && !isFunctionContext && !isVarContext && !isMacroContext) {
					symbolTable.functions.forEach(func => {
						// Only include global scope functions, not class methods
						if (!func.scope) {
							const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
							// Format parameters for display
							const paramsFormatted = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
							item.detail = `function ${func.name}(${paramsFormatted}) -> ${func.returnType}`;
							item.documentation = `Function defined in this file`;
							items.push(item);
						}
					});
					
					symbolTable.importedSymbols.functions.forEach(func => {
						// Only include functions without class context
						if (!func.className) {
							const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
							// Format parameters for display
							const paramsFormatted = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
							item.detail = `function ${func.name}(${paramsFormatted}) -> ${func.returnType}`;
							item.documentation = `Imported function from ${path.basename(func.sourceFile)}`;
							items.push(item);
						}
					});
				}
				
				// 3. Method calls after a dot
				if (isMethodCallContext) {
					// Find which class's methods to suggest
					const beforeDot = linePrefix.substring(0, linePrefix.lastIndexOf('.')).trim();
					const lastWord = beforeDot.split(/\s+/).pop();
					
					// Try to find the variable with this name to get its type
					const variable = symbolTable.variables.find(v => v.name === lastWord);
					if (variable) {
						// Variable found, get its type
						const varType = variable.type;
						
						// Find class definition for this type
						const classDef = symbolTable.classes.find(c => c.name === varType) ||
							symbolTable.importedSymbols.classes.find(c => c.name === varType);
						
						if (classDef) {
							// If it's a class instance, add its methods
							if (classDef.members && classDef.members.functions) {
								classDef.members.functions.forEach(method => {
									const item = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
									// Format parameters for display
									const paramsFormatted = method.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
									item.detail = `method ${method.name}(${paramsFormatted}) -> ${method.returnType}`;
									item.documentation = `Method of class ${varType}`;
									items.push(item);
								});
							}
							
							// Also add any imported methods for this class
							symbolTable.importedSymbols.functions.forEach(func => {
								if (func.className === varType) {
									const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Method);
									// Format parameters for display
									const paramsFormatted = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
									item.detail = `method ${func.name}(${paramsFormatted}) -> ${func.returnType}`;
									item.documentation = `Method of class ${varType} from ${path.basename(func.sourceFile)}`;
									items.push(item);
								}
							});
						}
					}
					
					// Always suggest 'new' as a special method for classes
					const newItem = new vscode.CompletionItem('new', vscode.CompletionItemKind.Method);
					newItem.detail = 'Constructor method';
					newItem.documentation = 'Creates a new instance of the class';
					items.push(newItem);
				}
				
				// 4. Variable names in the current scope
				if (!isClassContext && !isFunctionContext && !isVarContext && !isMacroContext) {
					symbolTable.variables.forEach(variable => {
						// Get current scope from position
						const currentLine = position.line;
						let inScope = false;
						
						// Simple scope check - global variables are always in scope
						if (variable.scope === 'global') {
							inScope = true;
						} else {
							// For class member variables, check if we're inside that class
							// This is a simplified scope check that would need to be improved
							const classForVariable = symbolTable.classes.find(c => c.name === variable.scope);
							if (classForVariable) {
								// Check if we're within the class definition
								// This assumes we're directly checking line numbers which might not be reliable
								// A proper implementation would track brace depth and scope boundaries
								inScope = (currentLine >= classForVariable.line);
							}
						}
						
						if (inScope) {
							const item = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Variable);
							item.detail = `var ${variable.name}: ${variable.type}`;
							item.documentation = variable.scope === 'global' 
								? 'Global variable' 
								: `Member of class ${variable.scope}`;
							items.push(item);
						}
					});
				}
				
				// 5. Macro names for macro calls
				if (!isClassContext && !isFunctionContext && !isVarContext && !isMacroContext) {
					// Check if we're typing after an @ symbol
					const isMacroCallContext = linePrefix.match(/@\w*$/);
					
					if (isMacroCallContext) {
						symbolTable.macros.forEach(macro => {
							const item = new vscode.CompletionItem(macro.name, vscode.CompletionItemKind.Snippet);
							// Format parameters for display
							const paramsFormatted = macro.parameters.join(', ');
							item.detail = `macro ${macro.name}(${paramsFormatted})`;
							item.documentation = `Macro defined in this file`;
							item.insertText = macro.name;
							items.push(item);
						});
						
						symbolTable.importedSymbols.macros.forEach(macro => {
							const item = new vscode.CompletionItem(macro.name, vscode.CompletionItemKind.Snippet);
							// Format parameters for display
							const paramsFormatted = macro.parameters.join(', ');
							item.detail = `macro ${macro.name}(${paramsFormatted})`;
							item.documentation = `Imported macro from ${path.basename(macro.sourceFile)}`;
							item.insertText = macro.name;
							items.push(item);
						});
					}
				}
			
				// Common snippets
				const classSnippet = new vscode.CompletionItem('class definition', vscode.CompletionItemKind.Snippet);
				classSnippet.insertText = new vscode.SnippetString('class ${1:ClassName} {\n\t$0\n}');
				classSnippet.documentation = 'Create a new class';
				
				const mainSnippet = new vscode.CompletionItem('main function', vscode.CompletionItemKind.Snippet);
				mainSnippet.insertText = new vscode.SnippetString('def main() -> void {\n\t$0\n}');
				mainSnippet.documentation = 'Create a main function';
				
				const functionSnippet = new vscode.CompletionItem('function definition', vscode.CompletionItemKind.Snippet);
				functionSnippet.insertText = new vscode.SnippetString('def ${1:functionName}(${2:parameters}) -> ${3:returnType} {\n\t$0\n}');
				functionSnippet.documentation = 'Create a new function';
				
				const varSnippet = new vscode.CompletionItem('variable declaration', vscode.CompletionItemKind.Snippet);
				varSnippet.insertText = new vscode.SnippetString('var ${1:name} ${2:type} = ${3:value}');
				varSnippet.documentation = 'Declare a new variable';
				
				const loopSnippet = new vscode.CompletionItem('loop', vscode.CompletionItemKind.Snippet);
				loopSnippet.insertText = new vscode.SnippetString('loop {\n\t$0\n}');
				loopSnippet.documentation = 'Create a loop';
				
				const ifSnippet = new vscode.CompletionItem('if statement', vscode.CompletionItemKind.Snippet);
				ifSnippet.insertText = new vscode.SnippetString('if (${1:condition}) {\n\t$0\n}');
				ifSnippet.documentation = 'Create an if statement';
				
				const macroSnippet = new vscode.CompletionItem('macro definition', vscode.CompletionItemKind.Snippet);
				macroSnippet.insertText = new vscode.SnippetString('macro ${1:macroName}(${2:parameters}) {\n\t$0\n}');
				macroSnippet.documentation = 'Create a macro';
				
				items.push(classSnippet, mainSnippet, functionSnippet, varSnippet, loopSnippet, ifSnippet, macroSnippet);
				
				return items;
		}
		},
		// Trigger completion on these characters
		...'.,:@'
	);

	// Register hover provider for Pangy files
	const hoverProvider = vscode.languages.registerHoverProvider('pangy', {
		provideHover(document, position) {
			const range = document.getWordRangeAtPosition(position);
			if (!range) return;
			
			const word = document.getText(range);
			const line = document.lineAt(position.line).text;
			
			// Check if this is a function call by examining if the word is followed by a parenthesis
			const functionCallMatch = line.substring(range.end.character).match(/^\s*\(/);
			if (functionCallMatch) {
				// Get function details from document diagnostics
				const diagnosticCollection = vscode.languages.getDiagnostics(document.uri);
				const functionSymbols = diagnosticCollection.filter(d => d.functionInfo && d.functionInfo.name === word);
				
				if (functionSymbols.length > 0) {
					const funcInfo = functionSymbols[0].functionInfo;
					// Format parameter list for display
					const paramsFormatted = funcInfo.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
					let hoverContent = `function ${word}(${paramsFormatted}) -> ${funcInfo.returnType}`;
					
					// Add source information if available
					if (funcInfo.sourceFile) {
						const fileName = path.basename(funcInfo.sourceFile);
						hoverContent += `\n\nDefined in: ${fileName}`;
						if (funcInfo.className) {
							hoverContent += `, class ${funcInfo.className}`;
						}
					}
					
					return new vscode.Hover(hoverContent);
				}
				
				// Handle built-in functions
				const builtInFuncMap = {
					'print': { 
						signature: 'print(value: any) -> void', 
						description: 'Outputs the given value to the console' 
					},
					'input': { 
						signature: 'input() -> string', 
						description: 'Reads a line of input from the user' 
					},
					'to_int': { 
						signature: 'to_int(value: string) -> int', 
						description: 'Converts a string to an integer' 
					},
					'to_string': { 
						signature: 'to_string(value: any) -> string', 
						description: 'Converts a value to a string' 
					},
					'to_stringf': { 
						signature: 'to_stringf(value: float) -> string', 
						description: 'Converts a float to a string' 
					},
					'to_intf': { 
						signature: 'to_intf(value: float) -> int', 
						description: 'Converts a float to an integer' 
					},
					'append': { 
						signature: 'append(array: any[], value: any) -> void', 
						description: 'Adds an element to the end of an array' 
					},
					'pop': { 
						signature: 'pop(array: any[]) -> any', 
						description: 'Removes and returns the last element of an array' 
					},
					'length': { 
						signature: 'length(array: any[]) -> int', 
						description: 'Returns the number of elements in an array' 
					},
					'index': { 
						signature: 'index(array: any[], value: any) -> int', 
						description: 'Returns the index of a value in an array, or -1 if not found' 
					},
					'open': { 
						signature: 'open(path: string, mode: string) -> file', 
						description: 'Opens a file and returns a file pointer. Mode can be "r" (read), "w" (write), or "a" (append)' 
					},
					'write': { 
						signature: 'write(file: file, data: string) -> void', 
						description: 'Writes data to a file' 
					},
					'read': { 
						signature: 'read(file: file, bytes: int) -> string', 
						description: 'Reads data from a file' 
					},
					'close': { 
						signature: 'close(file: file) -> void', 
						description: 'Closes a file' 
					}
				};
				
				if (builtInFuncMap[word]) {
					return new vscode.Hover(`${builtInFuncMap[word].signature}\n\n${builtInFuncMap[word].description}\n\nBuilt-in function`);
				}
			}
			
			// Hover information for keywords and built-ins
			const hoverMap = {
				'class': 'Declares a class, a blueprint for creating objects',
				'def': 'Declares a function',
				'if': 'Conditional statement that executes if a condition is true',
				'else if': 'Additional condition to check if previous conditions are false',
				'else': 'Executes if all previous conditions are false',
				'loop': 'Creates a loop that continues until explicitly stopped',
				'stop': 'Exits a loop',
				'var': 'Declares a variable',
				'return': 'Exits a function and optionally returns a value',
				'include': 'Imports functionality from other Pangy files',
				'int': 'Integer data type',
				'float': 'Floating-point data type',
				'string': 'Text data type',
				'void': 'Function return type indicating no return value',
				'file': 'File pointer data type',
				'public': 'Access modifier making members accessible outside the class',
				'private': 'Access modifier restricting access to class members',
				'macro': 'Defines a code template that expands when called with @',
				'this': 'References the current instance of the class',
				'print': 'Built-in function to output values to the console',
				'input': 'Built-in function to read a line of input from the user',
				'to_int': 'Converts a string to an integer',
				'to_string': 'Converts a value to a string',
				'to_stringf': 'Converts a float to a string',
				'to_intf': 'Converts a float to an integer',
				'append': 'Adds an element to the end of an array',
				'pop': 'Removes and returns the last element of an array',
				'length': 'Returns the number of elements in an array',
				'index': 'Finds the index of an element in an array',
				'open': 'Opens a file and returns a file pointer',
				'write': 'Writes data to a file',
				'read': 'Reads data from a file',
				'close': 'Closes a file',
				'new': 'Creates a new instance of a class'
			};
			
			// Check for array types
			if (word === 'int[]' || word === 'string[]' || word === 'float[]') {
				const baseType = word.split('[')[0];
				return new vscode.Hover(`Array of ${baseType} values`);
			}
			
			// Check for macro calls
			if (line.includes('@' + word)) {
				return new vscode.Hover(`Call to macro '${word}'`);
			}
			
			// Return hover info if available
			if (hoverMap[word]) {
				return new vscode.Hover(hoverMap[word]);
			}
		}
	});

	// Create a diagnostic collection for Pangy
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('pangy');
	
	// Register a document change listener for diagnostics
	const documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
		if (event.document.languageId === 'pangy') {
			updateDiagnostics(event.document, diagnosticCollection);
		}
	});
	
	// Register a document open listener to populate symbols
	const documentOpenListener = vscode.workspace.onDidOpenTextDocument(document => {
		if (document.languageId === 'pangy') {
			updateDiagnostics(document, diagnosticCollection);
		}
	});
	
	// Register a document close listener to clean up symbols
	const documentCloseListener = vscode.workspace.onDidCloseTextDocument(document => {
		if (document.languageId === 'pangy') {
			globalSymbolRegistry.clearSymbolsForDocument(document.uri);
		}
	});
	
	// Initial diagnostics for all open Pangy documents
	if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'pangy') {
		updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
	}

	// Add subscriptions to the context
	context.subscriptions.push(
		completionProvider, 
		hoverProvider, 
		documentChangeListener,
		documentOpenListener,
		documentCloseListener,
		diagnosticCollection
	);

	// Register the command to run Pangy files
	let runFileCommand = vscode.commands.registerCommand('pangy.runFile', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.languageId === 'pangy') {
			const filePath = editor.document.fileName;
			const outputDir = path.join(os.tmpdir(), 'pangy_output');
			const baseName = path.basename(filePath, '.pangy');
			const outputPath = path.join(outputDir, baseName);

			// Create output directory if it doesn't exist
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			const terminal = vscode.window.createTerminal('Pangy Run');
			terminal.show();

			// Compile command
			const compileCommand = `pangy compile "${filePath}" -o "${outputPath}"`;
			terminal.sendText(compileCommand);

			// Execute command (chain after successful compilation)
			// We need a slight delay to ensure compilation finishes before execution.
			// A more robust solution might involve checking for the output file's existence or using a pangy compiler flag that waits.
			terminal.sendText(`if [ $? -eq 0 ]; then sleep 0.5 && "${outputPath}"; else echo "Compilation failed."; fi`);

		} else {
			vscode.window.showInformationMessage('No active Pangy file found.');
		}
	});

	context.subscriptions.push(runFileCommand);
}

/**
 * Update diagnostics for a Pangy document
 * @param {vscode.TextDocument} document
 * @param {vscode.DiagnosticCollection} collection
 */
function updateDiagnostics(document, collection) {
	const diagnostics = [];
	const text = document.getText();
	const lines = text.split('\n');

	const symbolTable = {
		classes: [], // { name: string, line: number, members: { functions: [], variables: [] } }
		functions: [], // { name: string, parameters: { name: string, type: string }[], returnType: string, line: number }
		macros: [], // { name: string, parameters: string[], line: number }
		variables: [], // { name: string, type: string, line: number, scope: string } // scope can be 'global' or className
		includes: [], // { path: string, alias: string, line: number, type: 'file' | 'class' | 'macro' | 'inner_class', resolvedFilePath: string | null }
		importedSymbols: { classes: [], macros: [], functions: [] } // Stores symbols confirmed from included files
	};

	let currentClassScope = null; // To track the current class scope for variables/functions
	let currentClassDefForMembers = null; // To link members to the current class in symbolTable

	// Regular expressions for parsing (within updateDiagnostics)
	const classRegexDiag = /class\s+([A-Za-z_][A-Za-z0-9_]*)/;
	const funcRegexDiag = /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*(\[\])?)/;
	const macroRegexDiag = /macro\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;
	const varRegexDiag = /var\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*(\[\])?)/;
	const paramRegexDiag = /([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*(\[\])?)/g; // For params: name type
	const includeRegexDiag = /include\s+([A-Za-z_][A-Za-z0-9_.]*(@[A-Za-z_][A-Za-z0-9_]*)?)/; // Kept for parseIncludeStatement call

	// Helper function to parse include statements
	function parseIncludeStatement(line, lineNumber, documentDir) {
		const match = line.match(includeRegexDiag); // Use diag specific regex
		if (!match) return null;

		const fullPath = match[1];
		const parts = fullPath.split('.');
		let alias = parts[parts.length - 1];
		let type = 'file'; // Default type
		let resolvedFilePath = null;

		// Determine the base path for the .pgy file
		// e.g., include mylibrary.utils.MyClass -> potential file is mylibrary/utils.pgy or mylibrary.pgy
		// e.g., include mylibrary -> potential file is mylibrary.pgy
		let baseModulePath = parts[0];
		let possiblePaths = [];
		
		// Generate all possible module paths to check
		// For include veclib.vectors.vec.Vector3D, we'll check:
		// 1. veclib.pgy
		// 2. veclib/vectors.pgy
		// 3. veclib/vectors/vec.pgy
		
		// First try: base module (e.g., veclib.pgy)
		possiblePaths.push({
			path: parts[0] + '.pgy',
			remainingPath: parts.slice(1).join('.')
		});
		
		// For multi-part paths, try progressive nesting
		if (parts.length > 1) {
			for (let i = 1; i < parts.length; i++) {
				// Skip the last part if it starts with uppercase (likely a class name)
				if (i === parts.length - 1 && /^[A-Z]/.test(parts[i])) {
					break;
				}
				
				const modulePath = parts.slice(0, i + 1).join(path.sep) + '.pgy';
				const remainingPath = parts.slice(i + 1).join('.');
				possiblePaths.push({
					path: modulePath,
					remainingPath: remainingPath
				});
			}
		}
		
		// Try to resolve the file from all possible paths
		for (const possiblePath of possiblePaths) {
			// Try in current directory
			let potentialPath = path.resolve(documentDir, possiblePath.path);
			if (fs.existsSync(potentialPath)) {
				resolvedFilePath = potentialPath;
				// If we found the file and there's a remaining path, it's likely a class or inner class
				if (possiblePath.remainingPath) {
					const lastPart = possiblePath.remainingPath.split('.').pop();
					if (lastPart && /^[A-Z]/.test(lastPart)) {
						alias = lastPart;
						type = 'class';
					}
				}
				break;
			}
			
			// Try in ~/.pangylibs/
			const pangyLibsDir = path.join(os.homedir(), '.pangylibs');
			potentialPath = path.resolve(pangyLibsDir, possiblePath.path);
			if (fs.existsSync(potentialPath)) {
				resolvedFilePath = potentialPath;
				// Same check for remaining path
				if (possiblePath.remainingPath) {
					const lastPart = possiblePath.remainingPath.split('.').pop();
					if (lastPart && /^[A-Z]/.test(lastPart)) {
						alias = lastPart;
						type = 'class';
					}
				}
				break;
			}
		}

		if (!resolvedFilePath) {
			// Create a more helpful error message
			const paths = possiblePaths.map(p => p.path).join(', ');
			diagnostics.push({
				message: `Could not resolve include path '${fullPath}'. Tried: ${paths}`,
				range: new vscode.Range(lineNumber, line.indexOf(fullPath), lineNumber, line.indexOf(fullPath) + fullPath.length),
				severity: vscode.DiagnosticSeverity.Error
			});
		}

		if (alias.startsWith('@')) {
			type = 'macro';
			alias = alias.substring(1); // Remove @ for alias
		} else if (/^[A-Z]/.test(alias)) {
            // Check if the part before the supposed class/inner class is also uppercase (indicating class.InnerClass)
            if (parts.length > 1 && /^[A-Z]/.test(parts[parts.length - 2])) {
                type = 'inner_class';
            } else {
                type = 'class';
            }
        }
        // else type remains 'file'

		return { path: fullPath, alias, line: lineNumber, type, resolvedFilePath };
	}

	// First pass: Populate symbol table
	const documentDir = path.dirname(document.uri.fsPath);
	let braceDepthStack = []; // To handle nested class scopes, though Pangy might not support them explicitly

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Check for include statements first
		const includeInfo = parseIncludeStatement(line, i, documentDir);
		if (includeInfo) {
			symbolTable.includes.push(includeInfo);
			// If file exists, try to parse it for specific symbols if requested
			if (includeInfo.resolvedFilePath && (includeInfo.type === 'class' || includeInfo.type === 'inner_class' || includeInfo.type === 'macro')) {
				try {
					const fileContent = fs.readFileSync(includeInfo.resolvedFilePath, 'utf8');
					const targetSyms = {};
					if (includeInfo.type === 'class') targetSyms.className = includeInfo.alias;
					if (includeInfo.type === 'inner_class') {
						const parts = includeInfo.path.split('.');
						if (parts.length > 1) targetSyms.className = parts[parts.length - 2];
						targetSyms.innerClassName = includeInfo.alias;
					}
					if (includeInfo.type === 'macro') targetSyms.macroName = includeInfo.alias;

					const parsedSymbols = parsePangyFileRecursive(fileContent, includeInfo.resolvedFilePath, documentDir, targetSyms, new Set());

					let found = false;
					if (includeInfo.type === 'class' && parsedSymbols.classes.some(c => c.name === includeInfo.alias)) {
						found = true;
						symbolTable.importedSymbols.classes.push({ name: includeInfo.alias, sourceFile: includeInfo.resolvedFilePath });
						
						// Also add functions from the class for hover information
						const importedClass = parsedSymbols.classes.find(c => c.name === includeInfo.alias);
						if (importedClass && importedClass.members && importedClass.members.functions) {
							importedClass.members.functions.forEach(func => {
								symbolTable.importedSymbols.functions.push({
									name: func.name,
									parameters: func.parameters,
									returnType: func.returnType,
									sourceFile: includeInfo.resolvedFilePath,
									className: includeInfo.alias
								});
							});
						}
					} else if (includeInfo.type === 'inner_class') {
						const parentClass = parsedSymbols.classes.find(c => c.name === targetSyms.className);
						// Basic check for inner class existence needs refinement in parsePangyFileContentForSymbols
						// For now, we assume if parent is found, and the alias matches, it's a placeholder.
						// A proper check would look for `class InnerClassName` within the parent class scope.
						if (parentClass) { // Simplified: Real check would be parentClass.members.classes.some(ic => ic.name === includeInfo.alias)
							found = true; // Placeholder for actual inner class parsing
							symbolTable.importedSymbols.classes.push({ name: includeInfo.alias, sourceFile: includeInfo.resolvedFilePath, isInner: true, parentClass: targetSyms.className });
						}
					} else if (includeInfo.type === 'macro' && parsedSymbols.macros.some(m => m.name === includeInfo.alias)) {
						found = true;
						symbolTable.importedSymbols.macros.push({ name: includeInfo.alias, sourceFile: includeInfo.resolvedFilePath, params: parsedSymbols.macros.find(m => m.name === includeInfo.alias).parameters });
					} else if (includeInfo.type === 'file') {
						// For file includes, import all top-level functions
						found = true;
						parsedSymbols.functions.forEach(func => {
							symbolTable.importedSymbols.functions.push({
								name: func.name,
								parameters: func.parameters,
								returnType: func.returnType,
								sourceFile: includeInfo.resolvedFilePath
							});
						});
					}

					if (!found) {
						diagnostics.push({
							message: `${includeInfo.type.charAt(0).toUpperCase() + includeInfo.type.slice(1)} '${includeInfo.alias}' not found in '${path.basename(includeInfo.resolvedFilePath)}'. Path: ${includeInfo.path}`,
							range: new vscode.Range(i, line.indexOf(includeInfo.path), i, line.indexOf(includeInfo.path) + includeInfo.path.length),
							severity: vscode.DiagnosticSeverity.Error
						});
					}
				} catch (e) {
					diagnostics.push({
						message: `Error reading or parsing included file '${includeInfo.resolvedFilePath}': ${e.message}`,
						range: new vscode.Range(i, line.indexOf(includeInfo.path), i, line.indexOf(includeInfo.path) + includeInfo.path.length),
						severity: vscode.DiagnosticSeverity.Error
					});
				}
			}
			continue;
		}

		// Check for class definitions
		const classMatch = line.match(classRegexDiag);
		if (classMatch) {
			const className = classMatch[1];
			currentClassDefForMembers = { name: className, line: i, members: { functions: [], variables: [] } };
			symbolTable.classes.push(currentClassDefForMembers);
			currentClassScope = className; // Set current class scope
			if (line.includes('{')) braceDepthStack.push('class');

			if (!line.endsWith('{') && !line.match(/class\s+\w+\s*\{.*\}/)) { // also check for one-liner class { ... }
				diagnostics.push({
					message: "Class definition should end with '{'",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Error
				});
			}
			continue; // Move to next line after processing class definition
		}

		// Reset current class if we encounter '}' at the beginning of a line (simplistic scope handling)
        if (line.startsWith('}')) {
            if (braceDepthStack.length > 0) {
                braceDepthStack.pop();
            }
            if (braceDepthStack.length === 0) { // Exited all nested structures, back to global or no scope
                currentClassScope = null;
                currentClassDefForMembers = null;
            }
            // Potentially, if braceDepthStack had a class name, can revert currentClassScope to outer class if nested.
        }

		// Check for function definitions
		const funcMatch = line.match(funcRegexDiag);
		if (funcMatch) {
			const funcName = funcMatch[1];
			const paramsString = funcMatch[2];
			const returnType = funcMatch[3];
			const parameters = [];
			let paramMatch;
			while ((paramMatch = paramRegexDiag.exec(paramsString)) !== null) {
				parameters.push({ name: paramMatch[1], type: paramMatch[2] }); // name type
			}
			const funcData = { name: funcName, parameters, returnType, line: i, scope: currentClassScope };
			symbolTable.functions.push(funcData);
			if (currentClassDefForMembers) {
				currentClassDefForMembers.members.functions.push(funcData);
			}

			if (!line.includes('{') && !line.match(/def\s+.*\{.*\}/)) {
				diagnostics.push({
					message: "Function definition should usually end with '{' or have its body on the same line.",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Warning 
				});
			}
			continue;
		}

		// Check for macro definitions
		const macroMatch = line.match(macroRegexDiag);
		if (macroMatch) {
			const macroName = macroMatch[1];
			const paramsString = macroMatch[2];
			const parameters = paramsString.split(',').map(p => p.trim()).filter(p => p);
			symbolTable.macros.push({ name: macroName, parameters, line: i });
			// Basic check: macro definition should end with '{'
			if (!line.includes('{') && !line.match(/macro\s+.*\{.*\}/)) {
				diagnostics.push({
					message: "Macro definition should usually end with '{' or have its body on the same line.",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Warning
				});
			}
			continue;
		}

		// Check for variable declarations
		const varMatch = line.match(varRegexDiag);
		if (varMatch) {
			const varName = varMatch[1];
			const varType = varMatch[2];
			const varData = { name: varName, type: varType, line: i, scope: currentClassScope || 'global' };
			symbolTable.variables.push(varData);
			if (currentClassDefForMembers) {
				currentClassDefForMembers.members.variables.push(varData);
			}

			// Basic check: variable declarations should have a type
			if (!varType) {
				diagnostics.push({
					message: "Variable declaration must include a type (int, float, string, file, or a class name).",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Error
				});
			}
			continue;
		}

		// Check for unbalanced macro calls (simple check, can be improved)
		if (line.includes('@')) {
			const atCount = (line.match(/@/g) || []).length;
			const parenCount = (line.match(/\(/g) || []).length;
			// This is a very basic check and might not cover all cases correctly.
			// For example, it doesn't understand nested calls or comments.
			if (atCount > 0 && atCount !== parenCount) { 
				// A more refined check for macros might be needed if this proves too noisy or inaccurate.
				diagnostics.push({
					message: "Macro call seems unbalanced. Expected: @macroName(parameters)",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Error
				});
			}
		}
	}

	// console.log("Symbol Table:", JSON.stringify(symbolTable, null, 2)); // For debugging

	// Second pass: Type checking and other diagnostics
	const knownTypes = [...DEFAULT_TYPES];

	// Add class names from current file to known types
	symbolTable.classes.forEach(cls => knownTypes.push(cls.name));
	// Add imported class names to known types
	symbolTable.importedSymbols.classes.forEach(incCls => {
		if (!knownTypes.includes(incCls.name)) {
			knownTypes.push(incCls.name);
		}
	});

	// Check variable types
	symbolTable.variables.forEach(variable => {
		if (!knownTypes.includes(variable.type)) {
			const lineContent = lines[variable.line];
			diagnostics.push({
				message: `Unknown type '${variable.type}' for variable '${variable.name}'. Known types are: int, string, float, file, void, defined classes, and their array forms (e.g., int[]).`,
				range: new vscode.Range(variable.line, lineContent.indexOf(variable.type), variable.line, lineContent.indexOf(variable.type) + variable.type.length),
				severity: vscode.DiagnosticSeverity.Error
			});
		}
	});

	// Check function return types and parameter types
	symbolTable.functions.forEach(func => {
		// Check return type
		if (!knownTypes.includes(func.returnType)) {
			const lineContent = lines[func.line];
			const returnTypeIndex = lineContent.lastIndexOf(func.returnType); // lastIndexOf to get the one after ->
			diagnostics.push({
				message: `Unknown return type '${func.returnType}' for function '${func.name}'.`,
				range: new vscode.Range(func.line, returnTypeIndex, func.line, returnTypeIndex + func.returnType.length),
				severity: vscode.DiagnosticSeverity.Error
			});
		}
		// Check parameter types
		func.parameters.forEach(param => {
			if (!knownTypes.includes(param.type)) {
				const lineContent = lines[func.line];
				// Finding the exact position of a param type within a potentially complex string can be tricky.
				// This regex tries to find 'name type' or 'name type[]' for the specific parameter.
				const paramRegexSource = `${param.name}(\\s+)${param.type.replace('[', '\\\[').replace(']', '\\\]')}`;
				const paramSpecificRegex = new RegExp(paramRegexSource);
				const paramMatchInLine = lineContent.match(paramSpecificRegex);
				
				let paramTypeStartIndex = -1;
				if(paramMatchInLine && paramMatchInLine.index !== undefined && paramMatchInLine[1] !== undefined){
					// paramMatchInLine[0] is "name type"
					// paramMatchInLine[1] is the whitespace captured by (\\s+)
					// paramMatchInLine.index is the start of "name"
					paramTypeStartIndex = paramMatchInLine.index + param.name.length + paramMatchInLine[1].length;
				} else {
					// Fallback: try to find the type directly, might be less accurate
					// This fallback might be needed if param.name or param.type contains regex special characters not handled by a simple replace
					let tempStartIndex = lineContent.indexOf(param.type);
					// A more robust fallback might search for ` ${param.type}` or `(${param.type}` etc.
					// For now, we will try to be a bit smarter if name is present
					const nameIndex = lineContent.indexOf(param.name);
					if (nameIndex !== -1) {
						const typeIndexAfterName = lineContent.indexOf(param.type, nameIndex + param.name.length);
						if (typeIndexAfterName !== -1) {
							tempStartIndex = typeIndexAfterName;
						}
					}
					paramTypeStartIndex = tempStartIndex;
				}

				if (paramTypeStartIndex !== -1) {
				diagnostics.push({
					message: `Unknown type '${param.type}' for parameter '${param.name}' in function '${func.name}'.`,
					range: new vscode.Range(func.line, paramTypeStartIndex, func.line, paramTypeStartIndex + param.type.length),
					severity: vscode.DiagnosticSeverity.Error
				});
				} else {
					// If we cannot find the parameter type precisely, highlight the whole function signature line or a default part
					diagnostics.push({
						message: `Unknown type '${param.type}' for parameter '${param.name}' in function '${func.name}'. (Could not determine exact location of type)`,
						range: new vscode.Range(func.line, lineContent.indexOf('(') +1, func.line, lineContent.indexOf(')')), // Highlight parameters part
						severity: vscode.DiagnosticSeverity.Error
					});
				}
			}
		});
	});

	// Check Macro Calls
	for (let i = 0; i < lines.length; i++) {
		const lineContent = lines[i]; // Not trimmed, to preserve character positions
		// Regex to find all @macroName occurrences
		const macroCallRegex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
		let match;
		while ((match = macroCallRegex.exec(lineContent)) !== null) {
			const macroName = match[1];
			const macroExistsInCurrentFile = symbolTable.macros.some(m => m.name === macroName);
			const macroExistsInImports = symbolTable.importedSymbols.macros.some(m => m.name === macroName);

			if (!macroExistsInCurrentFile && !macroExistsInImports) {
				diagnostics.push({
					message: `Undefined macro '@${macroName}'. Make sure it's defined in this file or imported correctly.`,
					range: new vscode.Range(i, match.index, i, match.index + macroName.length + 1),
					severity: vscode.DiagnosticSeverity.Error
				});
			} else {
				// Optional: Check number of arguments if Pangy macros have fixed arity defined
				// This would require parsing the arguments in the call: lineContent.substring(match.index + match[0].length)
				// And comparing with macroDef.parameters.length
			}
		}
	}

	// Check for undefined classes, variables, and macros
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Skip checking for errors in string literals, comments, and declaration statements
		if (line.trim().startsWith('//') || 
		    line.trim().startsWith('var ') || 
		    line.trim().startsWith('def ') || 
		    line.trim().startsWith('class ') ||
		    line.trim().startsWith('include ')) { // Skip include statements
			continue;
		}
		
		// Handle string literals to avoid checking words inside them
		let processedLine = line;
		const stringLiterals = line.match(/"[^"]*"/g) || [];
		for (const str of stringLiterals) {
			processedLine = processedLine.replace(str, ' '.repeat(str.length));
		}
		
		const words = processedLine.split(/\s+|[.(){}[\],;=+\-*/%<>!&|^~]/);
		
		for (const word of words) {
			// Skip empty words, keywords, numbers, and standard types
			if (!word || 
			    /^(if|else|loop|stop|return|include|class|def|var|public|private|macro|this|static|new)$/.test(word) || 
			    /^[0-9]+$/.test(word) || 
			    DEFAULT_TYPES.includes(word) ||
			    word.length < 2) {
				continue;
			}
			
			// Check if the word is a class name (starts with capital letter) and not already defined
			if (/^[A-Z]/.test(word)) {
				const classExists = symbolTable.classes.some(c => c.name === word) || 
								   symbolTable.importedSymbols.classes.some(c => c.name === word);
				
				// Skip method calls (e.g., Test.new())
				const isMethodCall = line.includes('.' + word);
				
				if (!classExists && !DEFAULT_TYPES.includes(word) && !isMethodCall) {
					// Position detection (more accurate than just using the word index)
					const wordIndex = line.indexOf(word);
					if (wordIndex !== -1 && 
					    // Make sure it's a full word match
					    (wordIndex === 0 || !/[A-Za-z0-9_]/.test(line[wordIndex-1])) && 
					    (wordIndex + word.length === line.length || !/[A-Za-z0-9_]/.test(line[wordIndex + word.length]))) {
					    
						diagnostics.push({
							message: `Class '${word}' is not defined. Check spelling or ensure it's properly imported.`,
							range: new vscode.Range(i, wordIndex, i, wordIndex + word.length),
							severity: vscode.DiagnosticSeverity.Error
						});
					}
				}
			}
			// Check for variable references (excluding declarations and function parameters)
			else if (/^[a-z_][A-Za-z0-9_]*$/.test(word)) {
				// Skip checks for:
				// 1. Function parameters (these are defined within function scope)
				// 2. Method calls (e.g., test.test_msg())
				// 3. Variables defined in the current scope
				const isParameter = symbolTable.functions.some(f => 
					f.parameters.some(p => p.name === word)
				);
				const isMethodCall = line.includes('.' + word) || processedLine.includes(word + '(');
				const variableExists = symbolTable.variables.some(v => v.name === word);
				
				if (!variableExists && !isParameter && !isMethodCall && 
				    // Ignore built-in functions
				    !['print', 'input', 'to_int', 'to_string', 'to_stringf', 'to_intf', 
				     'append', 'pop', 'length', 'index', 'open', 'write', 'read', 'close'].includes(word)) {
					
					// Position detection for the variable
					const wordIndex = line.indexOf(word);
					if (wordIndex !== -1 && 
					    // Make sure it's a full word match
					    (wordIndex === 0 || !/[A-Za-z0-9_]/.test(line[wordIndex-1])) && 
					    (wordIndex + word.length === line.length || !/[A-Za-z0-9_]/.test(line[wordIndex + word.length]))) {
						
						diagnostics.push({
							message: `Variable '${word}' is not defined. Check spelling or define it before use.`,
							range: new vscode.Range(i, wordIndex, i, wordIndex + word.length),
							severity: vscode.DiagnosticSeverity.Error
						});
					}
				}
			}
		}
	}

	// Check function calls for undefined functions - Fixing to avoid flagging method calls
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Skip string literals to avoid checking function calls inside them
		let processedLine = line;
		const stringLiterals = line.match(/"[^"]*"/g) || [];
		for (const str of stringLiterals) {
			processedLine = processedLine.replace(str, ' '.repeat(str.length));
		}
		
		let match;
		const functionCallRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
		
		while ((match = functionCallRegex.exec(processedLine)) !== null) {
			const functionName = match[1];
			
			// Skip if the match is part of a definition or a method call
			if (line.trim().startsWith('def') || 
			    line.trim().startsWith('class') || 
			    line.trim().startsWith('macro') ||
			    // Check if it's a method call (preceded by a dot)
			    (match.index > 0 && line.substring(0, match.index).trimRight().endsWith('.')) ||
			    // Check if it's the special 'new' constructor method
			    functionName === 'new') {
				continue;
			}
			
			// Check if the function exists in the current file or imports
			const functionExists = symbolTable.functions.some(f => f.name === functionName) || 
								  symbolTable.importedSymbols.functions.some(f => f.name === functionName) ||
								  ['print', 'input', 'to_int', 'to_string', 'to_stringf', 'to_intf', 
								   'append', 'pop', 'length', 'index', 'open', 'write', 'read', 'close'].includes(functionName);
			
			if (!functionExists) {
				const diagnostic = {
					message: `Function '${functionName}' is not defined. Check spelling or ensure it's properly imported.`,
					range: new vscode.Range(i, match.index, i, match.index + functionName.length),
					severity: vscode.DiagnosticSeverity.Error
				};
				diagnostics.push(diagnostic);
			} else {
				// Store function info for hover provider
				const functionDef = symbolTable.functions.find(f => f.name === functionName) || 
									symbolTable.importedSymbols.functions.find(f => f.name === functionName);
				
				if (functionDef) {
					// Create a diagnostic with severity = 0 (hidden) to store function info
					const infoDiagnostic = {
						message: `Function info: ${functionName}`,
						range: new vscode.Range(i, match.index, i, match.index + functionName.length),
						severity: vscode.DiagnosticSeverity.Hint,
						functionInfo: functionDef
					};
					diagnostics.push(infoDiagnostic);
				}
			}
		}
	}

	// Enhanced error handling for included libraries
	symbolTable.includes.forEach(include => {
		if (include.resolvedFilePath) {
			try {
				// Check if the file actually exists and is readable
				fs.accessSync(include.resolvedFilePath, fs.constants.R_OK);
				
				// Check if the file has valid syntax by trying to parse it
				const fileContent = fs.readFileSync(include.resolvedFilePath, 'utf8');
				const targetSyms = {};
				
				if (include.type === 'class') targetSyms.className = include.alias;
				if (include.type === 'inner_class') {
					const parts = include.path.split('.');
					if (parts.length > 1) targetSyms.className = parts[parts.length - 2];
					targetSyms.innerClassName = include.alias;
				}
				if (include.type === 'macro') targetSyms.macroName = include.alias;
				
				const parsedSymbols = parsePangyFileRecursive(fileContent, include.resolvedFilePath, documentDir, targetSyms, new Set());
				
				// Check if included library has errors
				if (parsedSymbols.errors && parsedSymbols.errors.length > 0) {
					for (const error of parsedSymbols.errors) {
						diagnostics.push({
							message: `Error in included library '${include.path}': ${error.message} (line ${error.line} in ${path.basename(include.resolvedFilePath)})`,
							range: new vscode.Range(include.line, 0, include.line, lines[include.line].length),
							severity: vscode.DiagnosticSeverity.Error,
							source: 'Pangy Library Error'
						});
					}
				}
			} catch (e) {
				diagnostics.push({
					message: `Error accessing or parsing included library '${include.path}': ${e.message}`,
					range: new vscode.Range(include.line, 0, include.line, lines[include.line].length),
					severity: vscode.DiagnosticSeverity.Error,
					source: 'Pangy Library Error'
				});
			}
		}
	});

	// Update the diagnostic collection
	collection.set(document.uri, diagnostics);
	
	// Store the symbol table in the global registry for autocomplete
	globalSymbolRegistry.setSymbolsForDocument(document.uri, {
		classes: symbolTable.classes,
		functions: symbolTable.functions,
		macros: symbolTable.macros,
		variables: symbolTable.variables,
		importedSymbols: symbolTable.importedSymbols
	});
}

/**
 * Parses a Pangy file content to extract class, function, and macro symbols.
 * This function can be called recursively for included files.
 * @param {string} fileContent The content of the .pgy file.
 * @param {string} currentFilePath The absolute path to the .pgy file being parsed.
 * @param {string} rootDocumentDir The directory of the root document being diagnosed (for resolving relative includes).
 * @param {{className?: string, innerClassName?: string, macroName?: string}} targetSymbols Specific symbols to look for.
 * @param {Set<string>} visitedFiles Set of already visited file paths to prevent circular includes.
 * @returns {{classes: Array<{name: string, line: number, members: { classes: any[], functions: any[], variables: any[], macros: any[] } }>, macros: Array<{name: string, params: string[], line: number}>, functions: Array<any>, errors: Array<{message: string, line: number}>}}
 */
function parsePangyFileRecursive(fileContent, currentFilePath, rootDocumentDir, targetSymbols = {}, visitedFiles = new Set()) {
    if (visitedFiles.has(currentFilePath)) {
        return { classes: [], macros: [], functions: [], errors: [] }; // Avoid circular dependency
    }
    visitedFiles.add(currentFilePath);

    const symbols = {
        classes: [],
        macros: [],
        functions: [],
        errors: [] // Added errors array to track issues in included files
    };
    const lines = fileContent.split('\n');
    let activeClassStack = []; // Stack to manage nested class scopes [{ def: classSymbol, depth: number }]
    let currentBraceDepth = 0;

    // Enhanced syntax validation for included files
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for unbalanced braces
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        
        if (openBraces !== closeBraces && line.includes('{') && line.includes('}') && !line.includes('//')) {
            symbols.errors.push({
                message: `Unbalanced braces`,
                line: i
            });
        }
        
        // Check for invalid syntax in function definitions
        if (line.startsWith('def') && !line.match(funcRegexGlobal)) {
            symbols.errors.push({
                message: `Invalid function definition syntax`,
                line: i
            });
        }
        
        // Check for invalid syntax in class definitions
        if (line.startsWith('class') && !line.match(classRegexGlobal)) {
            symbols.errors.push({
                message: `Invalid class definition syntax`,
                line: i
            });
        }
        
        // Check for invalid syntax in macro definitions
        if (line.startsWith('macro') && !line.match(macroRegexGlobal)) {
            symbols.errors.push({
                message: `Invalid macro definition syntax`,
                line: i
            });
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const originalLineNumber = i;

        // Update brace depth
        currentBraceDepth += (line.match(/\{/g) || []).length;
        currentBraceDepth -= (line.match(/\}/g) || []).length;

        // Pop from class stack if exiting a scope
        while (activeClassStack.length > 0 && currentBraceDepth < activeClassStack[activeClassStack.length - 1].depth) {
            activeClassStack.pop();
        }
        const currentScopeOwner = activeClassStack.length > 0 ? activeClassStack[activeClassStack.length - 1].def : null;

        const includeMatch = line.match(includeRegexGlobal);
        if (includeMatch) {
            const includePathRaw = includeMatch[1];
            // Basic parsing for now, needs to be robust like in updateDiagnostics
            const includeParts = includePathRaw.split('.');
            let includedModuleFile = includeParts[0] + '.pgy';
            if (includeParts.length > 1 && !/^[A-Z]/.test(includeParts[1]) && !includeParts[1].startsWith('@')) {
                includedModuleFile = includeParts.slice(0,2).join(path.sep) + '.pgy';
            }

            let resolvedIncludedPath = path.resolve(path.dirname(currentFilePath), includedModuleFile);
            if (!fs.existsSync(resolvedIncludedPath)) {
                resolvedIncludedPath = path.resolve(path.join(os.homedir(), '.pangylibs'), includedModuleFile);
            }

            if (fs.existsSync(resolvedIncludedPath) && !visitedFiles.has(resolvedIncludedPath)) {
                try {
                    const includedContent = fs.readFileSync(resolvedIncludedPath, 'utf8');
                    // If we are looking for a specific symbol down a chain (e.g. lib.mod.MyClass)
                    // and this include is part of that chain (e.g. lib.mod), we pass the target down.
                    let nextTargetSymbols = {}; // Simplified for now
                    // TODO: Refine how targetSymbols are passed down for multi-level includes.
                    const nestedSymbols = parsePangyFileRecursive(includedContent, resolvedIncludedPath, rootDocumentDir, nextTargetSymbols, visitedFiles);
                    symbols.classes.push(...nestedSymbols.classes.map(c => ({ ...c, sourceFile: resolvedIncludedPath })));
                    symbols.macros.push(...nestedSymbols.macros.map(m => ({ ...m, sourceFile: resolvedIncludedPath })));
                } catch (e) {
                    // console.error(`Error parsing included file ${resolvedIncludedPath}: ${e.message}`);
                }
            }
            continue;
        }

        const classMatch = line.match(classRegexGlobal);
        if (classMatch) {
            const className = classMatch[1];
            const classSymbol = { 
                name: className, 
                line: originalLineNumber, 
                sourceFile: currentFilePath,
                members: { classes: [], functions: [], variables: [], macros: [] } 
            };
            if (currentScopeOwner) { // This is an inner class
                currentScopeOwner.members.classes.push(classSymbol);
            } else {
                symbols.classes.push(classSymbol);
            }
            // If line contains "{", it means the class body starts, push to stack with current depth + 1
            if (line.includes('{')) {
                 activeClassStack.push({ def: classSymbol, depth: currentBraceDepth });
            }
            continue;
        }

        const macroMatch = line.match(macroRegexGlobal);
        if (macroMatch) {
            const macroName = macroMatch[1];
            const paramsString = macroMatch[2];
            const parameters = paramsString.split(',').map(p => p.trim()).filter(p => p);
            const macroSymbol = { name: macroName, parameters, line: originalLineNumber, sourceFile: currentFilePath };
            if (currentScopeOwner) { // Macro inside a class (if Pangy supports this)
                currentScopeOwner.members.macros.push(macroSymbol);
            } else {
                symbols.macros.push(macroSymbol);
            }
            continue;
        }

        // Parse functions for hover info and error checking
        const funcMatch = line.match(funcRegexGlobal);
        if (funcMatch) {
            const funcName = funcMatch[1];
            const paramsString = funcMatch[2];
            const returnType = funcMatch[3];
            
            // Parse parameters
            const parameters = [];
            const paramRegex = /([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*(\[\])?)/g;
            let paramMatch;
            while ((paramMatch = paramRegex.exec(paramsString)) !== null) {
                parameters.push({ name: paramMatch[1], type: paramMatch[2] });
            }
            
            const funcSymbol = { 
                name: funcName, 
                parameters, 
                returnType, 
                line: originalLineNumber, 
                sourceFile: currentFilePath 
            };
            
            if (currentScopeOwner) {
                currentScopeOwner.members.functions.push(funcSymbol);
            } else {
                symbols.functions.push(funcSymbol);
            }
            continue;
        }
    }

    // Filter symbols based on targetSymbols if provided (after full parse of this file)
    let finalSymbols = { classes: [], macros: [], functions: [], errors: symbols.errors };
    if (targetSymbols.macroName) {
        finalSymbols.macros = symbols.macros.filter(m => m.name === targetSymbols.macroName);
        if (targetSymbols.className) { // Looking for macro inside a specific class
            const parentClass = symbols.classes.find(c => c.name === targetSymbols.className);
            if (parentClass) finalSymbols.macros.push(...parentClass.members.macros.filter(m => m.name === targetSymbols.macroName));
        }
    }
    if (targetSymbols.className && !targetSymbols.innerClassName) {
        finalSymbols.classes = symbols.classes.filter(c => c.name === targetSymbols.className);
    }
    if (targetSymbols.className && targetSymbols.innerClassName) {
        const parentClass = symbols.classes.find(c => c.name === targetSymbols.className);
        if (parentClass) {
            finalSymbols.classes = parentClass.members.classes.filter(ic => ic.name === targetSymbols.innerClassName);
        }
    }

    // If no specific targets, or if targets were broad, return all found top-level symbols from this file
    if (!targetSymbols.className && !targetSymbols.macroName) return symbols;
    return finalSymbols;
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

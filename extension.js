// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TYPES = ['int', 'string', 'float', 'file', 'void', 'int[]', 'string[]', 'float[]', 'bool'];

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
					'private', 'macro', 'this', 'true', 'false'
				];
				
				keywords.forEach(keyword => {
					const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
					items.push(item);
				});
				
				// Types
				const types = ['int', 'string', 'void', 'float', 'file', 'int[]', 'string[]', 'float[]', 'bool'];
				
				types.forEach(type => {
					const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter);
					items.push(item);
				});
				
				// Built-in functions
				const builtins = [
					'print', 'input', 'to_int', 'to_string', 'to_stringf', 'to_intf',
					'append', 'pop', 'length', 'index', 'open', 'write', 'read', 'close', 'exec'
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
						case 'exec':
							item.documentation = 'Executes a shell command. Mode 0 for async, 1 for sync.';
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

			// Get the symbol table for this document
			const symbolTable = globalSymbolRegistry.getSymbolsForDocument(document.uri);

			// Check if this is a function definition by looking at the start of the line
			if (line.trim().startsWith('def ')) {
				// Find the function in the symbol table for the current line
				const functionDef = symbolTable.functions.find(func =>
					func.line === position.line
				);

				if (functionDef) {
					// Format parameter list for display
					const paramsFormatted = functionDef.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
					let hoverContent = `function ${functionDef.name}(${paramsFormatted}) -> ${functionDef.returnType}`;

					// Add source information (though for definition it's the current file)
					if (functionDef.sourceFile) {
						const fileName = path.basename(functionDef.sourceFile);
						hoverContent += `\n\nDefined in: ${fileName}`;
						if (functionDef.className) {
							hoverContent += `, class ${functionDef.className}`;
						}
					}

					return new vscode.Hover(hoverContent);
				}
			}

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
					},
					'exec': {
						signature: 'exec(cmd: string, mode: int) -> string',
						description: 'Executes a shell command. Mode 0 for async, 1 for sync. Returns command output if sync.'
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
				'new': 'Creates a new instance of a class',
				'exec': 'Built-in function to execute a shell command',
                'bool': 'Boolean data type (true/false)',
                'true': 'Boolean literal for true',
                'false': 'Boolean literal for false'
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
	const lines = text.split('\\n');

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
	const classRegexDiag = /class\\s+([A-Za-z_][A-Za-z0-9_]*)/;
	const funcRegexDiag = /def\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^)]*)\\)\\s*->\\s*([A-Za-z_][A-Za-z0-9_]*(\\[\\])?)/;
	const macroRegexDiag = /macro\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^)]*)\\)/;
	const varRegexDiag = /var\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+([A-Za-z_][A-Za-z0-9_]*(\\[\\])?)/;
	const paramRegexDiag = /([A-Za-z_][A-Za-z0-9_]*)\\s+([A-Za-z_][A-Za-z0-9_]*(\\[\\])?)/g; // For params: name type
	const includeRegexDiag = /include\\s+([A-Za-z_][A-Za-z0-9_.]*(@[A-Za-z_][A-Za-z0-9_]*)?)/; // Kept for parseIncludeStatement call
	const ifRegexDiag = /if\\s*\\(([^)]*)\\)/; // Regex to detect if statements

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
	let inBlockComment = false; // Flag to track if we are inside a /* */ block comment

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]; // Use original line for position detection
		const trimmedLine = line.trim();

		// Handle block comments /* */
		const blockCommentStart = trimmedLine.indexOf('/*');
		const blockCommentEnd = trimmedLine.indexOf('*/');

		if (inBlockComment) {
			if (blockCommentEnd !== -1) {
				inBlockComment = false;
				// If the end of the comment is on the same line as code, process the part after */
				if (blockCommentEnd + 2 < trimmedLine.length) {
					// Continue processing the rest of this line as if it were not in a comment
					// Adjust the trimmedLine to represent the code after the comment
					trimmedLine = trimmedLine.substring(blockCommentEnd + 2).trim();
				} else {
					continue; // Entire line was part of the comment or just the end marker
				}
			} else {
				continue; // Entire line is within a block comment
			}
		} else {
			if (blockCommentStart !== -1) {
				if (blockCommentEnd !== -1 && blockCommentEnd > blockCommentStart) {
					// Block comment starts and ends on the same line
					const beforeComment = trimmedLine.substring(0, blockCommentStart).trim();
					const afterComment = trimmedLine.substring(blockCommentEnd + 2).trim();
					// Combine relevant parts for processing
					trimmedLine = beforeComment + afterComment;
					// Ensure we don't accidentally enter a block comment state
					inBlockComment = false; 
				} else {
					// Block comment starts and continues onto next line(s)
					inBlockComment = true;
					// Process the part of the line before /*
					trimmedLine = trimmedLine.substring(0, blockCommentStart).trim();
					// If nothing is left on the line after removing the comment start, skip to next line
					if (trimmedLine === '') continue;
				}
			}
		}

		// Skip lines that are entirely single-line comments (// or #) after handling block comments
		if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
			continue;
		}
		
		// At this point, trimmedLine contains the non-commented part of the current line.
		// If trimmedLine is empty after removing comments, skip the rest of the checks for this line.
		if (trimmedLine === '') {
			continue;
		}


		// Check for include statements first
		const includeInfo = parseIncludeStatement(trimmedLine, i, documentDir);
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
		const classMatch = trimmedLine.match(classRegexDiag);
		if (classMatch) {
			const className = classMatch[1];
			currentClassDefForMembers = { name: className, line: i, members: { functions: [], variables: [] } };
			symbolTable.classes.push(currentClassDefForMembers);
			currentClassScope = className; // Set current class scope
			if (trimmedLine.includes('{')) braceDepthStack.push('class');

			if (!trimmedLine.endsWith('{') && !trimmedLine.match(/class\\s+\\w+\\s*\\{.*\\}/)) { // also check for one-liner class { ... }
				diagnostics.push({
					message: "Class definition should end with '{'",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Error
				});
			}
			continue; // Move to next line after processing class definition
		}

		// Reset current class if we encounter '}' at the beginning of a line (simplistic scope handling)
        if (trimmedLine.startsWith('}')) {
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
		const funcMatch = trimmedLine.match(funcRegexDiag);
		if (funcMatch) {
			const funcName = funcMatch[1]; // Reverted from 2 to 1
			const paramsString = funcMatch[2]; // Reverted from 3 to 2
			const returnType = funcMatch[3]; // Reverted from 4 to 3
			const parameters = [];
			let paramMatch;
			// Need a new regex to avoid issues with shared global state if using the same regex instance
			const localParamRegexDiag = /([A-Za-z_][A-Za-z0-9_]*)\\s+([A-Za-z_][A-Za-z0-9_]*(\\[\\])?)/g;
			while ((paramMatch = localParamRegexDiag.exec(paramsString)) !== null) {
				parameters.push({ name: paramMatch[1], type: paramMatch[2] }); // name type
			}
			const funcData = { 
                name: funcName, 
                parameters, 
                returnType, 
                line: i, 
                scope: currentClassScope, 
                accessModifier: funcMatch[1] || 'public' // This still seems incorrect, funcMatch[1] is the function name
            };
			symbolTable.functions.push(funcData);
			if (currentClassDefForMembers) {
				currentClassDefForMembers.members.functions.push(funcData);
			}

			if (!trimmedLine.includes('{') && !trimmedLine.match(/def\\s+.*\\{.*\\}/)) {
				diagnostics.push({
					message: "Function definition should usually end with '{' or have its body on the same line.",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Warning 
				});
			}
			continue;
		}

		// Check for macro definitions
		const macroMatch = trimmedLine.match(macroRegexDiag);
		if (macroMatch) {
			const macroName = macroMatch[1];
			const paramsString = macroMatch[2];
			const parameters = paramsString.split(',').map(p => p.trim()).filter(p => p);
			symbolTable.macros.push({ name: macroName, parameters, line: i });
			// Basic check: macro definition should end with '{'
			if (!trimmedLine.includes('{') && !trimmedLine.match(/macro\\s+.*\\{.*\\}/)) {
				diagnostics.push({
					message: "Macro definition should usually end with '{' or have its body on the same line.",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Warning
				});
			}
			continue;
		}

		// Check for variable declarations
		const varMatch = trimmedLine.match(varRegexDiag);
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

		// Check for if statements
		const ifMatch = trimmedLine.match(ifRegexDiag);
		if (ifMatch) {
			if (!trimmedLine.includes('{') && !trimmedLine.match(/if\\s*\\([^)]*\\)\\s*\\{.*\\}/)) {
				diagnostics.push({
					message: "If statement should usually end with '{' or have its body on the same line.",
					range: new vscode.Range(i, 0, i, lines[i].length),
					severity: vscode.DiagnosticSeverity.Warning 
				});
			}
			continue;
		}

		// Check for unbalanced macro calls (simple check, can be improved)
		if (trimmedLine.includes('@')) {
			// This check is too simplistic and should be removed or significantly improved
			// as it will flag valid code with macros and parentheses.
			// For now, let's remove this potentially noisy diagnostic.
			//
			// const atCount = (trimmedLine.match(/@/g) || []).length;
			// const parenCount = (trimmedLine.match(/\\(/g) || []).length;
			// if (atCount > 0 && atCount !== parenCount) {
			// 	diagnostics.push({
			// 		message: "Macro call seems unbalanced. Expected: @macroName(parameters)",
			// 		range: new vscode.Range(i, 0, i, lines[i].length),
			// 		severity: vscode.DiagnosticSeverity.Error
			// 	});
			// }
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
			const lineContent = lines[variable.line]; // Use original line to find position
			// Need to account for comments on the line when finding position
			const uncommentedLineContent = removeComments(lineContent);
			const typeIndexInUncommented = uncommentedLineContent.indexOf(variable.type);

			if (typeIndexInUncommented !== -1) {
				// Calculate the true index in the original line
				let charCount = 0;
				let originalIndex = -1;
				for(let k = 0; k < lineContent.length; k++) {
					if (!isCharInComment(lineContent, k)) {
						if (charCount === typeIndexInUncommented) {
							originalIndex = k;
							break;
						}
						charCount++;
					}
				}

				if (originalIndex !== -1) {
					diagnostics.push({
						message: `Unknown type '${variable.type}' for variable '${variable.name}'. Known types are: int, string, float, file, void, defined classes, and their array forms (e.g., int[]).`,
						range: new vscode.Range(variable.line, originalIndex, variable.line, originalIndex + variable.type.length),
						severity: vscode.DiagnosticSeverity.Error
					});
				} else {
					// Fallback if precise index calculation fails
					diagnostics.push({
						message: `Unknown type '${variable.type}' for variable '${variable.name}'.`,
						range: new vscode.Range(variable.line, 0, variable.line, lineContent.length),
						severity: vscode.DiagnosticSeverity.Error
					});
				}

			} else {
				// Fallback if type string is not found in uncommented content (shouldn't happen if parsing worked)
				diagnostics.push({
					message: `Unknown type '${variable.type}' for variable '${variable.name}'.`,
					range: new vscode.Range(variable.line, 0, variable.line, lineContent.length),
					severity: vscode.DiagnosticSeverity.Error
				});
			}
		}
	});

	// Check function return types and parameter types
	symbolTable.functions.forEach(func => {
		const lineContent = lines[func.line]; // Use original line
		const uncommentedLineContent = removeComments(lineContent);

		// Check return type
		if (!knownTypes.includes(func.returnType)) {
			const returnTypeIndexInUncommented = uncommentedLineContent.lastIndexOf(func.returnType);

			if (returnTypeIndexInUncommented !== -1) {
				let charCount = 0;
				let originalIndex = -1;
				for(let k = 0; k < lineContent.length; k++) {
					if (!isCharInComment(lineContent, k)) {
						if (charCount === returnTypeIndexInUncommented) {
							originalIndex = k;
							break;
						}
						charCount++;
					}
				}
				if (originalIndex !== -1) {
					diagnostics.push({
						message: `Unknown return type '${func.returnType}' for function '${func.name}'.`,
						range: new vscode.Range(func.line, originalIndex, func.line, originalIndex + func.returnType.length),
						severity: vscode.DiagnosticSeverity.Error
					});
				} else {
					diagnostics.push({
						message: `Unknown return type '${func.returnType}' for function '${func.name}'. (Could not determine exact location)`,
						range: new vscode.Range(func.line, 0, func.line, lineContent.length),
						severity: vscode.DiagnosticSeverity.Error
					});
				}
			} else {
				diagnostics.push({
					message: `Unknown return type '${func.returnType}' for function '${func.name}'.`,
					range: new vscode.Range(func.line, 0, func.line, lineContent.length),
					severity: vscode.DiagnosticSeverity.Error
				});
			}
		}
		// Check parameter types
		func.parameters.forEach(param => {
			if (!knownTypes.includes(param.type)) {
				// Finding the exact position of a param type within a potentially complex string can be tricky.
				// This regex tries to find 'name type' or 'name type[]' for the specific parameter.
				// We need to apply this regex to the uncommented part of the line.
				const paramsStringInUncommented = uncommentedLineContent.substring(uncommentedLineContent.indexOf('(') + 1, uncommentedLineContent.lastIndexOf(')'));
				
				const paramRegexSource = `${param.name}(\\s+)${param.type.replace('[', '\\\[').replace(']', '\\\]')}`;
				const paramSpecificRegex = new RegExp(paramRegexSource);
				const paramMatchInUncommented = paramsStringInUncommented.match(paramSpecificRegex);
				
				let paramTypeStartIndexInUncommented = -1;
				if(paramMatchInUncommented && paramMatchInUncommented.index !== undefined && paramMatchInUncommented[1] !== undefined){
					// paramMatchInUncommented[0] is "name type"
					// paramMatchInUncommented[1] is the whitespace captured by (\\s+)
					// paramMatchInUncommented.index is the start of "name" within the params string
					paramTypeStartIndexInUncommented = paramsStringInUncommented.indexOf('(') + 1 + paramMatchInUncommented.index + param.name.length + paramMatchInUncommented[1].length; // Adjust for start of line and '('
				}

				if (paramTypeStartIndexInUncommented !== -1) {
					// Calculate the true index in the original line
					let charCount = 0;
					let originalIndex = -1;
					for(let k = 0; k < lineContent.length; k++) {
						if (!isCharInComment(lineContent, k)) {
							if (charCount === paramTypeStartIndexInUncommented) {
								originalIndex = k;
								break;
							}
							charCount++;
						}
					}

					if (originalIndex !== -1) {
						diagnostics.push({
							message: `Unknown type '${param.type}' for parameter '${param.name}' in function '${func.name}'.`,
							range: new vscode.Range(func.line, originalIndex, func.line, originalIndex + param.type.length),
							severity: vscode.DiagnosticSeverity.Error
						});
					} else {
						diagnostics.push({
							message: `Unknown type '${param.type}' for parameter '${param.name}' in function '${func.name}'. (Could not determine exact location)`,
							range: new vscode.Range(func.line, lineContent.indexOf('(') +1, func.line, lineContent.indexOf(')')), // Highlight parameters part as fallback
							severity: vscode.DiagnosticSeverity.Error
						});
					}
				} else {
					// If we cannot find the parameter type precisely in the uncommented part
					diagnostics.push({
						message: `Unknown type '${param.type}' for parameter '${param.name}' in function '${func.name}'. (Could not determine exact location)`,
						range: new vscode.Range(func.line, lineContent.indexOf('(') +1, func.line, lineContent.indexOf(')')), // Highlight parameters part as fallback
						severity: vscode.DiagnosticSeverity.Error
					});
				}
			}
		});
	});

	// Check Macro Calls
	for (let i = 0; i < lines.length; i++) {
		const lineContent = lines[i]; // Not trimmed, to preserve character positions
		const uncommentedLineContent = removeComments(lineContent);

		// Regex to find all @macroName occurrences in uncommented content
		const macroCallRegex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
		let match;
		while ((match = macroCallRegex.exec(uncommentedLineContent)) !== null) {
			const macroName = match[1];
			const macroExistsInCurrentFile = symbolTable.macros.some(m => m.name === macroName);
			const macroExistsInImports = symbolTable.importedSymbols.macros.some(m => m.name === macroName);

			if (!macroExistsInCurrentFile && !macroExistsInImports) {
				// Calculate the true index in the original line
				let charCount = 0;
				let originalIndex = -1;
				for(let k = 0; k < lineContent.length; k++) {
					if (!isCharInComment(lineContent, k)) {
						if (charCount === match.index) {
							originalIndex = k;
							break;
						}
						charCount++;
					}
				}

				if (originalIndex !== -1) {
					diagnostics.push({
						message: `Undefined macro '@${macroName}'. Make sure it's defined in this file or imported correctly.`,
						range: new vscode.Range(i, originalIndex, i, originalIndex + macroName.length + 1), // +1 for '@'
						severity: vscode.DiagnosticSeverity.Error
					});
				} else {
					diagnostics.push({
						message: `Undefined macro '@${macroName}'. Make sure it's defined in this file or imported correctly. (Could not determine exact location)`,
						range: new vscode.Range(i, 0, i, lineContent.length),
						severity: vscode.DiagnosticSeverity.Error
					});
				}
			}
		}
	}

	// Check for undefined classes, variables, and functions (Excluding macro calls and comments)
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Get the uncommented part of the line
		const uncommentedLine = removeComments(line);

		// Skip checking for errors in string literals, comments, and declaration statements
		if (uncommentedLine.trim().startsWith('//') || // Should already be handled, but double check
		    uncommentedLine.trim().startsWith('#') || // Should already be handled, but double check
			uncommentedLine.trim().startsWith('/*') || // Should already be handled, but double check
		    uncommentedLine.trim().startsWith('var ') || 
		    uncommentedLine.trim().startsWith('def ') || 
		    uncommentedLine.trim().startsWith('class ') ||
		    uncommentedLine.trim().startsWith('include ')) { // Skip include statements
			continue;
		}
		
		// Handle string literals to avoid checking words inside them
		let processedLine = uncommentedLine;
		const stringLiterals = uncommentedLine.match(/"[^"]*"/g) || [];
		for (const str of stringLiterals) {
			processedLine = processedLine.replace(str, ' '.repeat(str.length));
		}
		
		const words = processedLine.split(/\s+|[.(){}[\],;=+\-*/%<>!&|^~]/);
		
		for (const word of words) {
			// Skip empty words, keywords, numbers, and standard types
			if (!word || 
			    /^(if|else|loop|stop|return|include|class|def|var|public|private|macro|this|static|new|true|false)$/.test(word) || 
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
				const isMethodCall = uncommentedLine.includes('.' + word);
				
				if (!classExists && !DEFAULT_TYPES.includes(word) && !isMethodCall) {
					// Position detection (more accurate than just using the word index) in the uncommented line
					const wordIndexInUncommented = uncommentedLine.indexOf(word);
					if (wordIndexInUncommented !== -1) {
						// Calculate the true index in the original line
						let charCount = 0;
						let originalIndex = -1;
						for(let k = 0; k < line.length; k++) {
							if (!isCharInComment(line, k)) {
								if (charCount === wordIndexInUncommented) {
									originalIndex = k;
									break;
								}
								charCount++;
							}
						}

						if (originalIndex !== -1) {
							diagnostics.push({
								message: `Class '${word}' is not defined. Check spelling or ensure it's properly imported.`,
								range: new vscode.Range(i, originalIndex, i, originalIndex + word.length),
								severity: vscode.DiagnosticSeverity.Error
							});
						} else {
							diagnostics.push({
								message: `Class '${word}' is not defined. (Could not determine exact location)`,
								range: new vscode.Range(i, 0, i, line.length),
								severity: vscode.DiagnosticSeverity.Error
							});
						}
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
				const isMethodCall = uncommentedLine.includes('.' + word) || processedLine.includes(word + '(');
				const variableExists = symbolTable.variables.some(v => v.name === word);
				
				if (!variableExists && !isParameter && !isMethodCall && 
				    // Ignore built-in functions
				    !['print', 'input', 'to_int', 'to_string', 'to_stringf', 'to_intf', 
				     'append', 'pop', 'length', 'index', 'open', 'write', 'read', 'close', 'exec'].includes(word)) { // Added 'exec'
					
					// Position detection for the variable in the uncommented line
					const wordIndexInUncommented = uncommentedLine.indexOf(word);
					if (wordIndexInUncommented !== -1) {
						// Calculate the true index in the original line
						let charCount = 0;
						let originalIndex = -1;
						for(let k = 0; k < line.length; k++) {
							if (!isCharInComment(line, k)) {
								if (charCount === wordIndexInUncommented) {
									originalIndex = k;
									break;
								}
								charCount++;
							}
						}

						if (originalIndex !== -1) {
							diagnostics.push({
								message: `Variable '${word}' is not defined. Check spelling or define it before use.`,
								range: new vscode.Range(i, originalIndex, i, originalIndex + word.length),
								severity: vscode.DiagnosticSeverity.Error
							});
						} else {
							diagnostics.push({
								message: `Variable '${word}' is not defined. (Could not determine exact location)`,
								range: new vscode.Range(i, 0, i, line.length),
								severity: vscode.DiagnosticSeverity.Error
							});
						}
					}
				}
			}
		}
	}

	// Check function calls for undefined functions - Fixing to avoid flagging method calls
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Get the uncommented part of the line
		const uncommentedLine = removeComments(line);

		// Skip string literals to avoid checking function calls inside them
		let processedLine = uncommentedLine;
		const stringLiterals = uncommentedLine.match(/"[^"]*"/g) || [];
		for (const str of stringLiterals) {
			processedLine = processedLine.replace(str, ' '.repeat(str.length));
		}
		
		let match;
		const functionCallRegex = /([A-Za-z_][A-Za-z0-9_]*)\\s*\\(/g;
		
		while ((match = functionCallRegex.exec(processedLine)) !== null) {
			const functionName = match[1];
			
			// Skip if the match is part of a definition or a method call
			if (uncommentedLine.trim().startsWith('def') || 
			    uncommentedLine.trim().startsWith('class') || 
			    uncommentedLine.trim().startsWith('macro') ||
			    // Add keywords that are followed by parentheses but are not functions
			    ['if', 'else if', 'else', 'loop', 'static', 'var'].includes(functionName) ||
			    // Check if it's a method call (preceded by a dot)
			    (match.index > 0 && processedLine.substring(0, match.index).trimRight().endsWith('.')) ||
			    // Check if it's the special 'new' constructor method
			    functionName === 'new') {
				continue;
			}
			
			// Check if the function exists in the current file or imports
			const functionExists = symbolTable.functions.some(f => f.name === functionName) || 
								  symbolTable.importedSymbols.functions.some(f => f.name === functionName) ||
								  ['print', 'input', 'to_int', 'to_string', 'to_stringf', 'to_intf', 
								   'append', 'pop', 'length', 'index', 'open', 'write', 'read', 'close', 'exec'].includes(functionName); // Added 'exec'
			
			if (!functionExists) {
				// Position detection in the uncommented line
				const funcIndexInUncommented = uncommentedLine.indexOf(functionName); // This might be inaccurate if the same name appears multiple times
				
				let originalIndex = -1;
				if (funcIndexInUncommented !== -1) {
					let charCount = 0;
					for(let k = 0; k < line.length; k++) {
						if (!isCharInComment(line, k)) {
							if (charCount === funcIndexInUncommented) {
								originalIndex = k;
								break;
							}
							charCount++;
						}
					}
				}


				if (originalIndex !== -1) {
					const diagnostic = {
						message: `Function '${functionName}' is not defined. Check spelling or ensure it's properly imported.`,
						range: new vscode.Range(i, originalIndex, i, originalIndex + functionName.length),
						severity: vscode.DiagnosticSeverity.Error
					};
					diagnostics.push(diagnostic);
				} else {
					const diagnostic = {
						message: `Function '${functionName}' is not defined. (Could not determine exact location)`,
						range: new vscode.Range(i, 0, i, line.length),
						severity: vscode.DiagnosticSeverity.Error
					};
					diagnostics.push(diagnostic);
				}

			} else {
				// Store function info for hover provider
				const functionDef = symbolTable.functions.find(f => f.name === functionName) || 
									symbolTable.importedSymbols.functions.find(f => f.name === functionName);
				
				if (functionDef) {
					// Position detection in the uncommented line
					const funcIndexInUncommented = uncommentedLine.indexOf(functionName); // This might be inaccurate if the same name appears multiple times
				
					let originalIndex = -1;
					if (funcIndexInUncommented !== -1) {
						let charCount = 0;
						for(let k = 0; k < line.length; k++) {
							if (!isCharInComment(line, k)) {
								if (charCount === funcIndexInUncommented) {
									originalIndex = k;
									break;
								}
								charCount++;
							}
						}
					}
					
					if (originalIndex !== -1) {
						// Create a diagnostic with severity = 0 (hidden) to store function info
						const infoDiagnostic = {
							message: `Function info: ${functionName}`,
							range: new vscode.Range(i, originalIndex, i, originalIndex + functionName.length),
							severity: vscode.DiagnosticSeverity.Hint, // Use Hint or Information for non-errors
							functionInfo: functionDef
						};
						diagnostics.push(infoDiagnostic);
					} else {
						// Fallback for hover info if position is hard to determine
						const infoDiagnostic = {
							message: `Function info: ${functionName} (Position undetermined)`,
							range: new vscode.Range(i, 0, i, line.length),
							severity: vscode.DiagnosticSeverity.Hint, // Use Hint or Information for non-errors
							functionInfo: functionDef
						};
						diagnostics.push(infoDiagnostic);
					}
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
				
				// Pass the visitedFiles set to the recursive function
				const visitedFilesForInclude = new Set();
				visitedFilesForInclude.add(document.uri.fsPath); // Add the current file to prevent including itself
				const parsedSymbols = parsePangyFileRecursive(fileContent, include.resolvedFilePath, documentDir, targetSyms, visitedFilesForInclude);
				
				// Check if included library has errors
				if (parsedSymbols.errors && parsedSymbols.errors.length > 0) {
					for (const error of parsedSymbols.errors) {
						diagnostics.push({
							message: `Error in included library '${include.path}': ${error.message} (line ${error.line + 1} in ${path.basename(include.resolvedFilePath)})`, // +1 for 1-based line number display
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

	// Helper function to remove comments from a line
	function removeComments(line) {
		let uncommentedLine = '';
		let inString = false;
		let inBlock = false; // Assuming block comments don't cross lines in this simple remover

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = line[i + 1];

			if (char === '"') {
				inString = !inString;
				uncommentedLine += char;
				continue;
			}

			if (inString) {
				uncommentedLine += char;
				continue;
			}

			// Handle block comments /* */
			if (char === '/' && nextChar === '*') {
				inBlock = true;
				i++; // Skip next char
				continue;
			}
			if (char === '*' && nextChar === '/') {
				inBlock = false;
				i++; // Skip next char
				continue;
			}

			if (inBlock) {
				continue;
			}

			// Handle single line comments // and #
			if ((char === '/' && nextChar === '/') || char === '#') {
				// Rest of the line is a comment
				break;
			}

			uncommentedLine += char;
		}
		return uncommentedLine;
	}

	// Helper function to check if a character is within a comment (single-line or block)
	// This requires re-parsing the comments for a specific line, could be optimized
	function isCharInComment(line, index) {
		let inString = false;
		let inBlock = false; // Tracks block comment state for the current line

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = line[i + 1];

			if (char === '"') {
				inString = !inString;
			}

			if (inString) {
				if (i === index) return false; // Character is in a string, not a comment
				continue;
			}

			// Handle block comments /* */
			if (char === '/' && nextChar === '*') {
				inBlock = true;
				i++; // Skip next char
				// Check if the index falls within this block comment start sequence
				if (index === i -1 || index === i) return true; // Covers both '/' and '*'
				continue;
			}
			if (char === '*' && nextChar === '/') {
				// Check if the index falls within this block comment end sequence
				if (index === i || index === i + 1) return true; // Covers both '*' and '/'
				inBlock = false;
				i++; // Skip next char
				continue;
			}

			if (inBlock) {
				if (i === index) return true; // Character is inside a block comment
				continue;
			}

			// Handle single line comments // and #
			if ((char === '/' && nextChar === '/') || char === '#') {
				if (i === index || (char === '/' && nextChar === '/' && index === i + 1)) return true; // Covers both chars for // or the #
				if (index > i) return true; // Index is after the start of a single-line comment
				// No need to continue parsing the rest of the line after a single-line comment
				break;
			}
			
			if (i === index) return false; // Character is not in a comment or string
		}
		return false; // Index was not found within any comment
	}


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
    const lines = fileContent.split('\\n');
    let activeClassStack = []; // Stack to manage nested class scopes [{ def: classSymbol, depth: number }]
    let currentBraceDepth = 0;
	let inBlockComment = false; // Track block comments within included files

    // Enhanced syntax validation for included files
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
		
		// Handle block comments /* */ for included files
		const blockCommentStart = line.indexOf('/*');
		const blockCommentEnd = line.indexOf('*/');

		if (inBlockComment) {
			if (blockCommentEnd !== -1) {
				inBlockComment = false;
				// If the end of the comment is on the same line as code, process the part after */
				if (blockCommentEnd + 2 < line.length) {
					// Continue processing the rest of this line
					line = line.substring(blockCommentEnd + 2).trim();
				} else {
					continue; // Entire line was part of the comment or just the end marker
				}
			} else {
				continue; // Entire line is within a block comment
			}
		} else {
			if (blockCommentStart !== -1) {
				if (blockCommentEnd !== -1 && blockCommentEnd > blockCommentStart) {
					// Block comment starts and ends on the same line
					const beforeComment = line.substring(0, blockCommentStart).trim();
					const afterComment = line.substring(blockCommentEnd + 2).trim();
					line = beforeComment + afterComment;
					inBlockComment = false; 
				} else {
					// Block comment starts and continues onto next line(s)
					inBlockComment = true;
					line = line.substring(0, blockCommentStart).trim();
					if (line === '') continue;
				}
			}
		}

		// Skip lines that are entirely single-line comments (// or #) after handling block comments
		if (line.startsWith('//') || line.startsWith('#')) {
			continue;
		}

		// If line is empty after removing comments, skip
		if (line === '') {
			continue;
		}
        
        // Check for unbalanced braces (only check non-commented parts)
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        
        if (openBraces !== closeBraces) { // Removed the comment check here, as we already processed line
            symbols.errors.push({
                message: `Unbalanced braces`,
                line: i
            });
        }
        
        // Check for invalid syntax in function definitions (on non-commented part)
        if (line.startsWith('def') && !line.match(funcRegexGlobal)) {
            symbols.errors.push({
                message: `Invalid function definition syntax`,
                line: i
            });
        }
        
        // Check for invalid syntax in class definitions (on non-commented part)
        if (line.startsWith('class') && !line.match(classRegexGlobal)) {
            symbols.errors.push({
                message: `Invalid class definition syntax`,
                line: i
            });
        }
        
        // Check for invalid syntax in macro definitions (on non-commented part)
        if (line.startsWith('macro') && !line.match(macroRegexGlobal)) {
            symbols.errors.push({
                message: `Invalid macro definition syntax`,
                line: i
            });
        }
    }

    inBlockComment = false; // Reset for the symbol extraction pass
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const originalLineNumber = i;

		// Handle block comments /* */ for symbol extraction pass
		const blockCommentStart = line.indexOf('/*');
		const blockCommentEnd = line.indexOf('*/');

		if (inBlockComment) {
			if (blockCommentEnd !== -1) {
				inBlockComment = false;
				if (blockCommentEnd + 2 < line.length) {
					line = line.substring(blockCommentEnd + 2).trim();
				} else {
					continue;
				}
			} else {
				continue;
			}
		} else {
			if (blockCommentStart !== -1) {
				if (blockCommentEnd !== -1 && blockCommentEnd > blockCommentStart) {
					const beforeComment = line.substring(0, blockCommentStart).trim();
					const afterComment = line.substring(blockCommentEnd + 2).trim();
					line = beforeComment + afterComment;
					inBlockComment = false; 
				} else {
					inBlockComment = true;
					line = line.substring(0, blockCommentStart).trim();
					if (line === '') continue;
				}
			}
		}

		// Skip lines that are entirely single-line comments (// or #)
		if (line.startsWith('//') || line.startsWith('#')) {
			continue;
		}

		// If line is empty after removing comments, skip
		if (line === '') {
			continue;
		}


        // Update brace depth (only count braces in non-commented parts)
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
					symbols.functions.push(...nestedSymbols.functions.map(f => ({ ...f, sourceFile: resolvedIncludedPath }))); // Also include functions
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
            const funcName = funcMatch[1]; // Reverted from 2 to 1
            const paramsString = funcMatch[2]; // Reverted from 3 to 2
            const returnType = funcMatch[3]; // Reverted from 4 to 3
            
            // Parse parameters
            const parameters = [];
            const paramRegex = /([A-Za-z_][A-Za-z0-9_]*)\\s+([A-Za-z_][A-Za-z0-9_]*(\\[\\])?)/g;
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
	// If a function is targeted (e.g., included as part of a file), include it
	if (targetSymbols.functionName) {
		finalSymbols.functions = symbols.functions.filter(f => f.name === targetSymbols.functionName);
		if (targetSymbols.className) { // Looking for function inside a specific class
            const parentClass = symbols.classes.find(c => c.name === targetSymbols.className);
            if (parentClass) finalSymbols.functions.push(...parentClass.members.functions.filter(f => f.name === targetSymbols.functionName));
        }
	}


    // If no specific targets, or if targets were broad, return all found top-level symbols from this file
    // Also return all functions for file includes
    if (!targetSymbols.className && !targetSymbols.macroName && !targetSymbols.functionName) return symbols;
	
	// For file includes, return all top-level functions found in the parsed symbols
	if (targetSymbols.type === 'file') {
		finalSymbols.functions = symbols.functions;
	}

    return finalSymbols;
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

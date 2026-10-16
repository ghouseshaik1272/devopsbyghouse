export const exercises = {
  c: {
    title: 'Print a two-line welcome',
    objective: 'Change the program so it prints a greeting for Ada, followed by a short learning message.',
    hint: 'Use printf from stdio.h. Put a newline (\\n) at the end of each line.',
    starter: '#include <stdio.h>\n\nint main(void) {\n    // Print two lines here\n    return 0;\n}',
    solution: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, Ada!\\n");\n    printf("You are learning C.\\n");\n    return 0;\n}',
    expected: 'Hello, Ada!\nYou are learning C.'
  },
  cpp: {
    title: 'Print a two-line welcome',
    objective: 'Use standard output to greet Ada and print a second line about learning C++.',
    hint: 'Use std::cout and the insertion operator <<. Add \\n or std::endl for a new line.',
    starter: '#include <iostream>\n\nint main() {\n    // Print two lines here\n    return 0;\n}',
    solution: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, Ada!\\n";\n    std::cout << "You are learning C++.\\n";\n    return 0;\n}',
    expected: 'Hello, Ada!\nYou are learning C++.'
  },
  java: {
    title: 'Print a two-line welcome',
    objective: 'Complete the Main program so it greets Ada and prints a second line about learning Java.',
    hint: 'Write both lines inside main using System.out.println(...).',
    starter: 'public class Main {\n    public static void main(String[] args) {\n        // Print two lines here\n    }\n}',
    solution: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Ada!");\n        System.out.println("You are learning Java.");\n    }\n}',
    expected: 'Hello, Ada!\nYou are learning Java.'
  },
  python: {
    title: 'Greet someone by name',
    objective: 'Store the name Ada in a variable, then print a greeting that uses the variable.',
    hint: 'Assign a string with name = "Ada". An f-string can include a variable inside curly braces.',
    starter: 'name = "Ada"\n# Print a greeting that uses name',
    solution: 'name = "Ada"\nprint(f"Hello, {name}!")',
    expected: 'Hello, Ada!'
  },
  r: {
    title: 'Greet someone by name',
    objective: 'Store the name Ada in a variable and use it to print a greeting.',
    hint: 'Assign with <-, then use cat() with sep = "" to join the greeting without extra spaces.',
    starter: 'name <- "Ada"\n# Print a greeting that uses name',
    solution: 'name <- "Ada"\ncat("Hello, ", name, "!\\n", sep = "")',
    expected: 'Hello, Ada!'
  },
  go: {
    title: 'Greet someone by name',
    objective: 'Create a name variable and print a greeting for Ada using fmt.',
    hint: 'Use := to declare a local variable. fmt.Printf supports %s for text values.',
    starter: 'package main\n\nimport "fmt"\n\nfunc main() {\n    name := "Ada"\n    // Print a greeting that uses name\n}',
    solution: 'package main\n\nimport "fmt"\n\nfunc main() {\n    name := "Ada"\n    fmt.Printf("Hello, %s!\\n", name)\n}',
    expected: 'Hello, Ada!'
  },
  linux: {
    title: 'Print a message in the shell',
    objective: 'Use one shell command to print “Hello, Ada!” followed by “Terminal ready.” on a new line.',
    hint: 'printf accepts a format string such as %s\\n and one or more values.',
    starter: '# Print the two requested lines',
    solution: "printf '%s\\n' 'Hello, Ada!' 'Terminal ready.'",
    expected: 'Hello, Ada!\nTerminal ready.'
  },
  sql: {
    title: 'Return values from a query',
    objective: 'Write one SELECT query that returns Ada as name and the result of 1 + 2 as total.',
    hint: 'A SELECT can return literal text and expressions. Use AS to name each result column.',
    starter: '-- Return a name and a calculated total',
    solution: "SELECT 'Ada' AS name, 1 + 2 AS total;",
    expected: 'name | total\nAda  | 3'
  }
};

// =====================================================================
// Game Room rounds
// ---------------------------------------------------------------------
// Every round has a "topic" that matches one of the TOPICS below.
// To add rounds for a new topic (like lists), add the topic to TOPICS,
// then add rounds below with that topic. The games pick them up
// automatically. Write each line of code as its own "..." in L( ).
// =====================================================================
(function () {
  "use strict";
  const L = (...lines) => lines.join("\n");

  const TOPICS = [
    { id: "print", label: "Print & Input" },
    { id: "variables", label: "Variables" },
    { id: "types", label: "Data Types" },
    { id: "conditionals", label: "If / Elif / Else" },
    { id: "loops", label: "Loops" },
  ];

  // ------------------------------------------------------------------
  // DEBUG RACE: broken code + the exact output it should print once fixed.
  // "inputs" are typed in automatically when the program asks a question.
  // ------------------------------------------------------------------
  const DEBUG = [
    // Print & Input
    { id: "p-d1", topic: "print", code: L('Print("Hello!")'), expected: "Hello!", hint: "Python only knows print with a lowercase p." },
    { id: "p-d2", topic: "print", code: L('print("Python is fun)'), expected: "Python is fun", hint: "Count the quotation marks." },
    { id: "p-d3", topic: "print", code: L('print("Ready, set, go!"'), expected: "Ready, set, go!", hint: "Every ( needs a matching )." },
    { id: "p-d4", topic: "print", code: L("print(Good job)"), expected: "Good job", hint: "Text needs quotes around it." },
    { id: "p-d5", topic: "print", code: L('print("My favorite color is" + "blue")'), expected: "My favorite color is blue", hint: "This one runs, but look closely at the output. Something is missing between the words." },
    { id: "p-d6", topic: "print", code: L('print("Line one")', 'print "Line two"'), expected: "Line one\nLine two", hint: "Compare line 2 to line 1." },
    { id: "p-d7", topic: "print", code: L('name = input("Name? ")', 'print("Hi " + Name)'), inputs: ["Sam"], expected: "Name? Sam\nHi Sam", hint: "Capital letters matter in names." },
    { id: "p-d8", topic: "print", code: L("print('Hello\")"), expected: "Hello", hint: "Both quotes have to be the same kind." },

    // Variables
    { id: "v-d1", topic: "variables", code: L('my name = "Ava"', "print(my name)"), expected: "Ava", hint: "Variable names can't have spaces. Use an underscore." },
    { id: "v-d2", topic: "variables", code: L("food = pizza", "print(food)"), expected: "pizza", hint: "The value is text, so it needs quotes." },
    { id: "v-d3", topic: "variables", code: L('color = "green"', 'print("color")'), expected: "green", hint: "Quotes print the exact word. No quotes print what's in the box." },
    { id: "v-d4", topic: "variables", code: L('pet = "dog"', "print(Pet)"), expected: "dog", hint: "Check the capital letters." },
    { id: "v-d5", topic: "variables", code: L('city = "Joliet"', 'print("I live in" + city)'), expected: "I live in Joliet", hint: "It runs, but the words are squished together." },
    { id: "v-d6", topic: "variables", code: L('1st_place = "Maya"', "print(1st_place)"), expected: "Maya", hint: "Variable names can't start with a number." },
    { id: "v-d7", topic: "variables", code: L('animal = "cat"', 'sound = "meow"', 'print(animal + " says " + Sound)'), expected: "cat says meow", hint: "One variable name is spelled differently." },
    { id: "v-d8", topic: "variables", code: L('game = "Minecraft"', 'print("I play " game)'), expected: "I play Minecraft", hint: "What joins two strings together?" },

    // Data types
    { id: "t-d1", topic: "types", code: L("age = 12", 'print("I am " + age)'), expected: "I am 12", hint: "You can't join a number to text. Use str()." },
    { id: "t-d2", topic: "types", code: L("print(6 x 7)"), expected: "42", hint: "Python uses a different symbol for multiply." },
    { id: "t-d3", topic: "types", code: L('print("5" + "5")'), expected: "10", hint: "It runs, but it's gluing text instead of adding numbers." },
    { id: "t-d4", topic: "types", code: L('age = input("Age? ")', "print(age + 1)"), inputs: ["12"], expected: "Age? 12\n13", hint: "input() always gives a string. Turn it into a number." },
    { id: "t-d5", topic: "types", code: L('num = int(input("Number? ")', "print(num * 2)"), inputs: ["4"], expected: "Number? 4\n8", hint: "Count the ( and the ) on line 1." },
    { id: "t-d6", topic: "types", code: L("price = 3", 'print("Total: " + str(price * 2)'), expected: "Total: 6", hint: "Count the parentheses." },
    { id: "t-d7", topic: "types", code: L('cookies = "12"', "kids = 4", "print(cookies / kids)"), expected: "3.0", hint: "You can't divide a string. Is cookies a number?" },
    { id: "t-d8", topic: "types", code: L('score = int("ten")', "print(score + 5)"), expected: "15", hint: "int() only understands digits." },

    // If / Elif / Else
    { id: "c-d1", topic: "conditionals", code: L("age = 13", "if age = 13:", '    print("Teen!")'), expected: "Teen!", hint: "One = stores. What compares?" },
    { id: "c-d2", topic: "conditionals", code: L('answer = "yes"', 'if answer == "yes"', '    print("Great!")'), expected: "Great!", hint: "The if line is missing something at the end." },
    { id: "c-d3", topic: "conditionals", code: L("x = 5", "if x > 3:", 'print("Big number")'), expected: "Big number", hint: "Code inside an if needs to be indented." },
    { id: "c-d4", topic: "conditionals", code: L("is_fun = true", "if is_fun:", '    print("Let\'s play!")'), expected: "Let's play!", hint: "Booleans start with a capital letter." },
    { id: "c-d5", topic: "conditionals", code: L("temp = 90", "if temp > 60:", '    print("Nice")', "elif temp > 85:", '    print("Hot!")'), expected: "Hot!", hint: "It runs, but Python stops at the first True check. Think about the order." },
    { id: "c-d6", topic: "conditionals", code: L('word = "Yes"', 'if word == "yes":', '    print("Matched!")', "else:", '    print("No match")'), expected: "Matched!", hint: "Is \"Yes\" the same as \"yes\" to Python?" },
    { id: "c-d7", topic: "conditionals", code: L("score = 75", "if score >= 90:", '    print("A")', "else score >= 70:", '    print("C")'), expected: "C", hint: "else can't have a condition. Which word can?" },
    { id: "c-d8", topic: "conditionals", code: L('age = input("Age? ")', "if age >= 13:", '    print("Teen")', "else:", '    print("Kid")'), inputs: ["15"], expected: "Age? 15\nTeen", hint: "You can't compare a string to a number. Use int()." },

    // Loops
    { id: "l-d1", topic: "loops", code: L("for i in range(3)", '    print("Hi")'), expected: "Hi\nHi\nHi", hint: "The for line is missing something at the end." },
    { id: "l-d2", topic: "loops", code: L("for i in range(1, 5):", "    print(i)"), expected: "1\n2\n3\n4\n5", hint: "It runs, but range stops before the last number." },
    { id: "l-d3", topic: "loops", code: L("count = 3", "while count > 0:", "    print(count)", "count = count - 1", 'print("Go!")'), expected: "3\n2\n1\nGo!", hint: "This loop never ends! Which line should be inside the loop?" },
    { id: "l-d4", topic: "loops", code: L("for i in range(3):", '    print("Number " + i)'), expected: "Number 0\nNumber 1\nNumber 2", hint: "i is a number. Turn it into text." },
    { id: "l-d5", topic: "loops", code: L("total = 0", "for n in range(1, 4):", "    total = total + n", "    print(total)"), expected: "6", hint: "It prints too many times. Should the print be inside the loop?" },
    { id: "l-d6", topic: "loops", code: L('for letter in "dog"', "    print(letter)"), expected: "d\no\ng", hint: "Look at the end of the first line." },
    { id: "l-d7", topic: "loops", code: L("n = 0", "while n < 3:", '    print("Loop!")'), expected: "Loop!\nLoop!\nLoop!", hint: "This never ends! n never changes." },
    { id: "l-d8", topic: "loops", code: L("for i in range(0, 10, 2):", "    print(i)"), expected: "2\n4\n6\n8\n10", hint: "It runs, but it starts and stops at the wrong numbers." },
  ];

  // ------------------------------------------------------------------
  // ESCAPE ROOM: students predict the output. The site runs the code to
  // get the answer, so you only write the code. Level 1 = easy, 3 = hard.
  // Avoid input() here.
  // ------------------------------------------------------------------
  const ESCAPE = [
    // Print & Input
    { id: "p-e1", topic: "print", level: 1, code: L('print("Hello")', 'print("World")') },
    { id: "p-e2", topic: "print", level: 1, code: L('print("Ha" + "ha")') },
    { id: "p-e3", topic: "print", level: 2, code: L('print("Go" + " " + "team")') },
    { id: "p-e4", topic: "print", level: 2, code: L('print("Hi" + "!" + "!")') },
    { id: "p-e5", topic: "print", level: 2, code: L('print("A")', 'print("B" + "C")') },
    { id: "p-e6", topic: "print", level: 3, code: L('print("3" + "4")') },
    { id: "p-e7", topic: "print", level: 3, code: L('print("abc" + "123" + "xyz")') },

    // Variables
    { id: "v-e1", topic: "variables", level: 1, code: L('x = "pizza"', "print(x)") },
    { id: "v-e2", topic: "variables", level: 1, code: L('pet = "cat"', 'print("pet")') },
    { id: "v-e3", topic: "variables", level: 2, code: L('a = "sun"', 'a = "moon"', "print(a)") },
    { id: "v-e4", topic: "variables", level: 2, code: L('first = "ice"', 'second = "cream"', "print(first + second)") },
    { id: "v-e5", topic: "variables", level: 2, code: L('name = "Leo"', 'print("Hi " + name + "!")') },
    { id: "v-e6", topic: "variables", level: 3, code: L('word = "bat"', 'word = word + "man"', "print(word)") },
    { id: "v-e7", topic: "variables", level: 3, code: L('a = "red"', "b = a", 'a = "blue"', "print(b)") },

    // Data types
    { id: "t-e1", topic: "types", level: 1, code: L("print(3 + 4)") },
    { id: "t-e2", topic: "types", level: 1, code: L('print("3" + "4")') },
    { id: "t-e3", topic: "types", level: 2, code: L("x = 5", "print(x * 3)") },
    { id: "t-e4", topic: "types", level: 2, code: L("age = 11", 'print("Age " + str(age + 1))') },
    { id: "t-e5", topic: "types", level: 2, code: L("print(7 / 2)") },
    { id: "t-e6", topic: "types", level: 3, code: L("print(10 / 2)") },
    { id: "t-e7", topic: "types", level: 3, code: L('print(int("7") + 3)') },
    { id: "t-e8", topic: "types", level: 3, code: L("print(str(2) + str(2))") },

    // If / Elif / Else
    { id: "c-e1", topic: "conditionals", level: 1, code: L("print(5 > 2)") },
    { id: "c-e2", topic: "conditionals", level: 1, code: L("print(4 == 5)") },
    { id: "c-e3", topic: "conditionals", level: 2, code: L("x = 10", "if x > 5:", '    print("big")', "else:", '    print("small")') },
    { id: "c-e4", topic: "conditionals", level: 2, code: L('print("cat" == "Cat")') },
    { id: "c-e5", topic: "conditionals", level: 2, code: L("score = 80", "if score >= 90:", '    print("A")', "elif score >= 70:", '    print("B")', "else:", '    print("C")') },
    { id: "c-e6", topic: "conditionals", level: 3, code: L("x = 7", "if x > 5:", '    print("one")', "if x > 6:", '    print("two")') },
    { id: "c-e7", topic: "conditionals", level: 3, code: L("temp = 50", "if temp > 80:", '    print("hot")', "elif temp > 60:", '    print("warm")', "else:", '    print("cold")') },
    { id: "c-e8", topic: "conditionals", level: 3, code: L("print(3 != 3)") },

    // Loops
    { id: "l-e1", topic: "loops", level: 1, code: L("for i in range(3):", '    print("hi")') },
    { id: "l-e2", topic: "loops", level: 1, code: L("for i in range(3):", "    print(i)") },
    { id: "l-e3", topic: "loops", level: 2, code: L("for i in range(1, 4):", "    print(i * 2)") },
    { id: "l-e4", topic: "loops", level: 2, code: L("count = 3", "while count > 0:", "    print(count)", "    count = count - 1") },
    { id: "l-e5", topic: "loops", level: 2, code: L('for letter in "hey":', "    print(letter)") },
    { id: "l-e6", topic: "loops", level: 3, code: L("total = 0", "for n in range(1, 5):", "    total = total + n", "print(total)") },
    { id: "l-e7", topic: "loops", level: 3, code: L("n = 1", "while n < 20:", "    n = n * 2", "print(n)") },
    { id: "l-e8", topic: "loops", level: 3, code: L("x = 0", "for i in range(4):", "    x = x + 2", "print(x)") },
  ];

  // ------------------------------------------------------------------
  // RELAY: a goal the team builds one line at a time.
  // The check can use any of these rules:
  //   expected:        the exact output (prompts and typed answers included)
  //   mustUse:         words that must appear in the code
  //   mustUseAny:      at least one of these words must appear
  //   minLines:        fewest lines of code
  //   minOutputLines:  fewest lines printed with print()
  //   outputIncludes:  text that must appear somewhere in the output
  //   inputs:          answers typed in automatically when checking
  // ------------------------------------------------------------------
  const RELAY = [
    { id: "p-r1", topic: "print", title: "Team poem", goal: "Print a poem that is at least 4 lines long. Each player adds one print() line.", example: "Roses are red\nPython is cool\nWe write our code\nAfter school", check: { mustUse: ["print"], minOutputLines: 4 } },
    { id: "p-r2", topic: "print", title: "Chatbot", goal: "Build a chatbot that asks at least 2 questions with input() and replies to each answer with print().", example: "What is your name? Sam\nHi Sam!\nFavorite food? tacos\ntacos are the best!", check: { mustUse: ["input", "print"], minLines: 4, minOutputLines: 2 }, inputs: ["Sam", "tacos", "blue", "soccer"] },

    { id: "v-r1", topic: "variables", title: "All about our team", goal: "Make 3 variables about your team (like a name, a color, and a food). Then print one sentence that uses all 3 variables.", example: "The Bug Squashers love blue and pizza!", check: { mustUse: ["=", "print", "+"], minLines: 4, minOutputLines: 1 } },
    { id: "v-r2", topic: "variables", title: "Mad Libs relay", goal: "Ask for 3 words with input(). Then print a silly story at least 2 lines long that uses all 3 words.", example: "Name an animal: llama\n...\nA purple llama ate 100 tacos!", check: { mustUse: ["input", "print"], minLines: 5, minOutputLines: 2 }, inputs: ["llama", "purple", "tacos", "jump", "Joliet"] },

    { id: "t-r1", topic: "types", title: "Future Me", goal: "Ask for an age (turn it into a number with int). Print how old they'll be in 10 years and in 20 years.", example: "How old are you? 12\nIn 10 years: 22\nIn 20 years: 32", check: { mustUse: ["input", "int(", "str(", "+"], minOutputLines: 2 }, inputs: ["12"] },
    { id: "t-r2", topic: "types", title: "Seconds machine", goal: "Print exactly these 3 numbers: seconds in a minute, in an hour, and in a day. Use math (*) instead of typing the answers.", example: "60\n3600\n86400", check: { expected: "60\n3600\n86400", mustUse: ["*"] } },

    { id: "c-r1", topic: "conditionals", title: "Password checker", goal: "Ask for a password. If it's right, print a welcome message. Otherwise, print a message telling them to go away.", example: "Password? banana\nGo away!", check: { mustUse: ["input", "if", "else", "=="], minOutputLines: 1 }, inputs: ["wrong-guess"] },
    { id: "c-r2", topic: "conditionals", title: "Grade machine", goal: "Ask for a score and turn it into a number. Print A for 90 and up, B for 80 and up, C for 70 and up, and \"Keep trying\" for anything lower.", example: "Score? 85\nB", check: { mustUse: ["int(", "if", "elif", "else"], outputIncludes: "B" }, inputs: ["85"] },

    { id: "l-r1", topic: "loops", title: "Count to 10", goal: "Use a loop to print the numbers 1 to 10, then print Done! at the end.", example: "1\n2\n...\n10\nDone!", check: { expected: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\nDone!", mustUseAny: ["for", "while"] } },
    { id: "l-r2", topic: "loops", title: "Blast off", goal: "Use a while loop to count down 5, 4, 3, 2, 1, then print Blast off!", example: "5\n4\n3\n2\n1\nBlast off!", check: { expected: "5\n4\n3\n2\n1\nBlast off!", mustUse: ["while"] } },
    { id: "l-r3", topic: "loops", title: "Times table", goal: "Use a for loop to print the 3 times table from 3 x 1 = 3 up to 3 x 5 = 15.", example: "3 x 1 = 3\n3 x 2 = 6\n...\n3 x 5 = 15", check: { expected: "3 x 1 = 3\n3 x 2 = 6\n3 x 3 = 9\n3 x 4 = 12\n3 x 5 = 15", mustUse: ["for"] } },
  ];

  window.C2C_GAMES = { TOPICS, DEBUG, ESCAPE, RELAY };
})();

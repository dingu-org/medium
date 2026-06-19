# Description

When client messages short senteces, and musltiple messages in a very short time. Example:

(13:01) C: Hello
(13:01) C: I wanted to leave an appointment
(13:01) C: Do you have any free time today

We need to handle these as a single message, so that we do not trigger 3 separate responses from the AI.

Maybe debounce messages? What would be the best way to handle this case?

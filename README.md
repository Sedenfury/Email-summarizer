THIS CODE IS RUNNING PERFECTLY FINE IN OUR PC's SO IF THERE ARE ANY PROBLEMS DURING EXECUTION PLEASE CONTACT US THROUGH MAIL.

1.) First extract the .rar file attached in repository/form

2.) Open google chrome and go to extensions -> manage extensions , enable developer mode from top right button
    and then Load unpacked and from that select the folder that contains manifest.js

3.) Open google cloud console create a project  

4.) Make sure to enable Gmail API through API and services.

5.) Now go to OAuth Client and select external user and add the mail id you want to test on.

6.) Go to credentials and then create OAuth client id and select chrome extension, give any name and in item id paste your extension id 

7.) Now copy the generated client id and paste it inside curly braces in line no. 17 manifest.json in client id .
       (Example: 930691050599-k9pohufh5e2jcvsq8sa17kl01ujekdgf.apps.googleusercontent.com)

8.) now reload the extension and run it , go to options and in Hugging Face API paste this key:  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 
     And now save it.

9.) reload the extension and done.

10.) You can now view your last 5 unread mails summarized precisely while also mentioning possibly important dates

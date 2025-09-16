import json
import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime

# Initialize AWS clients
ses = boto3.client('ses')
secrets_manager = boto3.client('secretsmanager')

# Configuration
SENDER_EMAIL = 'notify@myrecruiter.ai'
SPREADSHEET_ID = '1kKTScoRIFDn7ojk_-_wlzU4MQI5pNv3U2wuUj9HzbbI'
SECRET_NAME = 'google-sheets-service-account'
ERROR_EMAIL = 'support@myrecruiter.ai'

# Default recipients for most intents
DEFAULT_RECIPIENTS = [
    'cathy@nationalangels.org',
    'chris@myrecruiter.ai'
]

# Intent to recipient email mapping
INTENT_EMAIL_MAPPING = {
    'DonateGoodsIntent': [
        'info@austinangels.com',
        'cathy@nationalangels.org',
        'chris@myrecruiter.ai'
    ],
    'AssistanceIntent': DEFAULT_RECIPIENTS + ['taylor@austinangels.com', 'stevie@austinangels.com', 'mike@austinangels.com'],
    'DDApplyIntent': DEFAULT_RECIPIENTS + ['taylor@austinangels.com', 'stevie@austinangels.com', 'mike@austinangels.com'],
    'LBApplyIntent': DEFAULT_RECIPIENTS + ['taylor@austinangels.com', 'stevie@austinangels.com', 'mike@austinangels.com'], 
    'GroupDonationIntent': DEFAULT_RECIPIENTS + ['erika@nationalangels.org', 'susan@nationalangels.org']
}

# Define intent tags
INTENT_TAGS = {
    'DonateGoodsIntent': 'Donate Goods',
    'AssistanceIntent': 'Program Assistance',
    'DDApplyIntent': 'Apply Dare2Dream',
    'LBApplyIntent': 'Apply LoveBox',
    'GroupDonationIntent': 'Group Donation'
}

# Define slot structures for each intent with friendly labels
INTENT_SLOTS = {
    'DonateGoodsIntent': [
        ('ZipcodeDonateGoodsIntent', 'Zipcode'),
        ('FirstNameDonateGoodsIntent', 'First Name'),
        ('LastNameDonateGoodsIntent', 'Last Name'),
        ('PhoneDonateGoodsIntent', 'Phone'),
        ('EmailDonateGoodsIntent', 'Email'),
        ('NewsletterDonateGoodsIntent', 'Newsletter'),
        ('CommentsDonateGoodsIntent', 'Comments')
    ],
    'AssistanceIntent': [
        ('ZipcodeAssistance', 'Zipcode'),
        ('FirstNameAssistance', 'First Name'),
        ('LastNameAssistance', 'Last Name'),
        ('PhoneAssistance', 'Phone'),
        ('EmailAssistance', 'Email'),
        ('NewsletterAssistance', 'Newsletter'),
        ('CommentsAssistance', 'Comments')
    ],
    'DDApplyIntent': [
        ('ZipcodeDDApplyIntent', 'Zipcode'),
        ('FirstNameDDApplyIntent', 'First Name'),
        ('LastNameDDApplyIntent', 'Last Name'),
        ('PhoneDDApplyIntent', 'Phone'),
        ('EmailDDApplyIntent', 'Email'),
        ('NewsletterDDApplyIntent', 'Newsletter'),
        ('CommentsDDApplyIntent', 'Comments')
    ],
    'LBApplyIntent': [
        ('ZipcodeLBApply', 'Zipcode'),
        ('FirstNameLBApply', 'First Name'),
        ('LastNameLBApply', 'Last Name'),
        ('PhoneLBApply', 'Phone'),
        ('EmailLBApply', 'Email'),
        ('NewsletterLBApply', 'Newsletter'),
        ('CommentsLBApply', 'Comments')
    ],
    'GroupDonationIntent': [
        ('GroupDonation_Zipcode', 'Zipcode'),
        ('GroupDonation_FirstName', 'First Name'),
        ('GroupDonation_LastName', 'Last Name'),
        ('GroupDonation_Phone', 'Phone'),
        ('GroupDonation_Email', 'Email'),
        ('GroupDonation_Newsletter', 'Newsletter'),
        ('GroupDonation_Comments', 'Comments')
    ]
}

# Google Sheets configuration
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
RANGE_NAME = 'Sheet1!A:S'  # Extended range to include tracking columns

def extract_tracking_info(session_attributes):
    """Extract and format tracking information from session attributes"""
    return {
        'UTM Source': session_attributes.get('utm_source', 'direct'),
        'UTM Medium': session_attributes.get('utm_medium', 'none'),
        'UTM Campaign': session_attributes.get('utm_campaign', 'none'),
        'UTM Term': session_attributes.get('utm_term', ''),
        'UTM Content': session_attributes.get('utm_content', ''),
        'UTM Referral': session_attributes.get('utm_referral', ''),
        'Landing Time': session_attributes.get('landing_timestamp', ''),
        'Page URL': session_attributes.get('page_url', ''),
        'Browser Referrer': session_attributes.get('browser_referrer', '')
    }

def lambda_handler(event, context):
    print("Event received:", json.dumps(event, indent=2))
    
    try:
        # Extract bot name from the event
        bot_name = event.get('bot', {}).get('name', 'Unknown Bot')
        
        session_state = event.get('sessionState', {})
        intent = session_state.get('intent', {})
        intent_name = intent.get('name', "Unknown")
        slots = intent.get('slots', {})
        
        # Extract session attributes (tracking data)
        session_attributes = session_state.get('sessionAttributes', {})
        
        print(f"Processing intent: {intent_name} from bot: {bot_name}")
        print(f"Slots: {json.dumps(slots, indent=2)}")
        print(f"Session attributes: {json.dumps(session_attributes, indent=2)}")
        
        if intent_name in INTENT_TAGS:
            contact_info = process_slots(intent_name, slots)
            # Add bot name to contact info
            contact_info['Bot Name'] = bot_name
            
            # Add tracking information
            tracking_info = extract_tracking_info(session_attributes)
            contact_info.update(tracking_info)
            
            if has_minimum_contact_info(contact_info):
                email_result = send_email(intent_name, contact_info)
                sheet_result = update_google_sheet(intent_name, contact_info)
                print(f"Processed {intent_name}")
                print(f"Email sending result: {json.dumps(email_result, indent=2)}")
                print(f"Google Sheets update result: {json.dumps(sheet_result, indent=2)}")
                return_state = 'Fulfilled'
            else:
                print(f"Insufficient information for {intent_name}")
                return_state = 'ReadyForFulfillment'
        else:
            print(f"Unknown intent: {intent_name}")
            return_state = 'Failed'

        response = {
            'sessionState': {
                'dialogAction': {
                    'type': 'Delegate'
                },
                'intent': {
                    'name': intent_name,
                    'state': return_state
                },
                'sessionAttributes': session_attributes  # Preserve session attributes
            }
        }
        print(f"Returning response for {intent_name}:", json.dumps(response, indent=2))
        return response

    except Exception as e:
        error_message = f"Error in lambda_handler: {str(e)}\nEvent: {json.dumps(event)}"
        print(error_message)
        send_error_notification(f"Error processing intent: {intent_name} in bot: {bot_name}", error_message)
        return {
            'sessionState': {
                'dialogAction': {
                    'type': 'Delegate'
                },
                'intent': {
                    'name': intent_name,
                    'state': 'Failed'
                }
            }
        }

def process_slots(intent_name, slots):
    contact_info = {}
    for slot_name, friendly_name in INTENT_SLOTS[intent_name]:
        slot_value = slots.get(slot_name, {}).get('value', {}).get('interpretedValue', '')
        contact_info[friendly_name] = slot_value
    contact_info['Intent'] = INTENT_TAGS[intent_name]
    print(f"Processed slots for {intent_name}: {json.dumps(contact_info, indent=2)}")
    return contact_info

def has_minimum_contact_info(contact_info):
    required_fields = ['First Name', 'Last Name']
    contact_method = ['Email', 'Phone']
    
    has_required = all(contact_info.get(field) for field in required_fields)
    has_contact = any(contact_info.get(field) for field in contact_method)
    
    print(f"Has required fields: {has_required}")
    print(f"Has contact method: {has_contact}")
    
    return has_required and has_contact

def send_email(intent_name, contact_info):
    subject = f"New Contact Information - {INTENT_TAGS[intent_name]} ({contact_info['Bot Name']})"
    
    # Build email body with sections
    body = "=" * 50 + "\n"
    body += "NEW CONTACT SUBMISSION\n"
    body += "=" * 50 + "\n\n"
    
    # Contact Information Section
    body += "CONTACT INFORMATION:\n"
    body += "-" * 30 + "\n"
    body += f"Intent: {contact_info.get('Intent', 'Unknown')}\n"
    body += f"Bot Name: {contact_info.get('Bot Name', 'Unknown')}\n"
    body += f"First Name: {contact_info.get('First Name', '')}\n"
    body += f"Last Name: {contact_info.get('Last Name', '')}\n"
    body += f"Phone: {contact_info.get('Phone', '')}\n"
    body += f"Email: {contact_info.get('Email', '')}\n"
    body += f"Zipcode: {contact_info.get('Zipcode', '')}\n"
    body += f"Newsletter: {contact_info.get('Newsletter', '')}\n"
    body += f"Comments: {contact_info.get('Comments', '')}\n"
    
    # Campaign Tracking Section (only if campaign data exists)
    if contact_info.get('UTM Source') != 'direct' or contact_info.get('UTM Campaign') != 'none':
        body += "\n" + "=" * 50 + "\n"
        body += "CAMPAIGN TRACKING:\n"
        body += "-" * 30 + "\n"
        body += f"Source: {contact_info.get('UTM Source', 'Unknown')}\n"
        body += f"Medium: {contact_info.get('UTM Medium', 'Unknown')}\n"
        body += f"Campaign: {contact_info.get('UTM Campaign', 'Unknown')}\n"
        body += f"Term: {contact_info.get('UTM Term', 'N/A')}\n"
        body += f"Content: {contact_info.get('UTM Content', 'N/A')}\n"
        body += f"Referral: {contact_info.get('UTM Referral', 'N/A')}\n"
        body += f"Page URL: {contact_info.get('Page URL', 'N/A')}\n"
        body += f"Browser Referrer: {contact_info.get('Browser Referrer', 'Direct')}\n"
        body += f"Landing Time: {contact_info.get('Landing Time', 'N/A')}\n"
    
    body += "=" * 50 + "\n"

    recipient_emails = INTENT_EMAIL_MAPPING.get(intent_name, DEFAULT_RECIPIENTS)
    
    successful_sends = []
    failed_sends = []

    for recipient in recipient_emails:
        try:
            print(f"Attempting to send email from {SENDER_EMAIL} to {recipient}")
            response = ses.send_email(
                Source=SENDER_EMAIL,
                Destination={'ToAddresses': [recipient]},
                Message={
                    'Subject': {'Data': subject},
                    'Body': {'Text': {'Data': body}}
                }
            )
            print(f"Email sent successfully to {recipient} for intent: {intent_name}. MessageId: {response['MessageId']}")
            successful_sends.append(recipient)
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            print(f"Error sending email to {recipient} for intent {intent_name}. Error Code: {error_code}, Message: {error_message}")
            print(f"Full error details for {recipient}: {json.dumps(e.response, indent=2)}")
            failed_sends.append(recipient)
            send_error_notification(
                f"Error sending email from bot: {contact_info['Bot Name']}", 
                f"Failed to send email to {recipient} for intent {intent_name}. Error: {error_message}"
            )

    if successful_sends:
        print(f"Successfully sent emails to: {', '.join(successful_sends)}")
    if failed_sends:
        print(f"Failed to send emails to: {', '.join(failed_sends)}")

    print(f"Finished sending emails for intent: {intent_name}")

    return {
        "successful_sends": successful_sends,
        "failed_sends": failed_sends
    }
    
def get_secret():
    try:
        response = secrets_manager.get_secret_value(SecretId=SECRET_NAME)
        return json.loads(response['SecretString'])
    except Exception as e:
        send_error_notification("Error retrieving secret", str(e))
        raise

def setup_google_sheets_service():
    try:
        service_account_info = get_secret()
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info, scopes=SCOPES)
        return build('sheets', 'v4', credentials=credentials)
    except Exception as e:
        send_error_notification("Error setting up Google Sheets service", str(e))
        raise

def update_google_sheet(intent_name, contact_info):
    try:
        service = setup_google_sheets_service()
        values = [[
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),  # A: Create Date
            contact_info['Bot Name'],                       # B: Bot Name
            contact_info['Intent'],                         # C: Intent
            contact_info.get('First Name', ''),            # D: First Name
            contact_info.get('Last Name', ''),             # E: Last Name
            contact_info.get('Phone', ''),                 # F: Phone
            contact_info.get('Email', ''),                 # G: Email
            contact_info.get('Zipcode', ''),               # H: Zipcode
            contact_info.get('Newsletter', ''),            # I: Newsletter
            contact_info.get('Comments', ''),              # J: Comments
            # Campaign tracking columns
            contact_info.get('UTM Source', ''),            # K: UTM Source
            contact_info.get('UTM Medium', ''),            # L: UTM Medium
            contact_info.get('UTM Campaign', ''),          # M: UTM Campaign
            contact_info.get('UTM Term', ''),              # N: UTM Term
            contact_info.get('UTM Content', ''),           # O: UTM Content
            contact_info.get('UTM Referral', ''),          # P: UTM Referral
            contact_info.get('Landing Time', ''),          # Q: Landing Time
            contact_info.get('Page URL', ''),              # R: Page URL
            contact_info.get('Browser Referrer', '')       # S: Browser Referrer
        ]]
        
        body = {'values': values}
        response = service.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range=RANGE_NAME,
            valueInputOption='USER_ENTERED',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()
        
        return response
    except Exception as e:
        error_message = f"Error updating Google Sheet for intent {intent_name}: {str(e)}"
        print(error_message)
        send_error_notification(f"Error updating Google Sheet for bot: {contact_info['Bot Name']}", error_message)

def send_error_notification(error_type, error_message):
    try:
        subject = f'Error in Austin Angels Chatbot Lambda: {error_type}'
        body = f"Error Details:\n{error_message}"

        ses.send_email(
            Source=SENDER_EMAIL,
            Destination={'ToAddresses': [ERROR_EMAIL]},
            Message={
                'Subject': {'Data': subject},
                'Body': {'Text': {'Data': body}}
            }
        )
    except Exception as e:
        print(f"Failed to send error notification: {str(e)}")
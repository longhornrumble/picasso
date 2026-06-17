def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/plain"},
        "body": "placeholder — real code deploys via aws lambda update-function-code (out-of-band CI)",
    }

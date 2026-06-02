def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/plain"},
        "body": "placeholder - real code deploys via `aws lambda update-function-code` "
                "from Lambdas/lambda/send_email/ (CLAUDE.md SOP)",
    }

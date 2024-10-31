import json

import boto3
from botocore.exceptions import ClientError


def get_aws_secret(secret_name):
    region_name = "us-west-2"

    # Create a Secrets Manager client
    session = boto3.session.Session() # type: ignore
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )

        try:
            secret = json.loads(get_secret_value_response['SecretString'])
            return secret
        except json.JSONDecodeError:
            return get_secret_value_response['SecretString']
    except ClientError as e:
        raise e

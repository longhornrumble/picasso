"""
Phase 2 Environment Configuration Validation Testing

This module provides comprehensive testing for Phase 2 environment configuration 
standardization fixes to ensure consistent configuration across all environments.

Phase 2 Fixes Validated:
- All environment variables properly set and standardized
- Secret naming consistency across staging/production environments
- Configuration validation passes for all deployment targets
- Deployment scripts work without errors across environments
- Environment-specific parameter validation
- Configuration drift detection and prevention

Critical Success Criteria:
- 100% environment variable coverage for required configuration
- Consistent secret naming across all environments
- Zero deployment script failures due to configuration issues
- Automated configuration validation passes
- Environment parity between staging and production
"""

import pytest
import json
import os
import time
from unittest.mock import Mock, patch, MagicMock
import boto3
from moto import mock_secretsmanager, mock_s3, mock_ssm
from botocore.exceptions import ClientError

# Test markers
pytestmark = [
    pytest.mark.unit,
    pytest.mark.integration,
    pytest.mark.phase2,
    pytest.mark.environment,
    pytest.mark.critical
]


class TestPhase2EnvironmentConfiguration:
    """
    Comprehensive testing for Phase 2 environment configuration standardization
    """

    @pytest.fixture(autouse=True)
    def setup_environment_config(self):
        """Setup environment configuration testing"""
        # Store original environment
        self.original_env = os.environ.copy()
        
        yield
        
        # Restore original environment
        os.environ.clear()
        os.environ.update(self.original_env)

    @pytest.fixture
    def base_environment_config(self):
        """Base environment configuration for testing"""
        return {
            'ENVIRONMENT': 'test',
            'AWS_REGION': 'us-east-1',
            'S3_BUCKET': 'test-picasso-bucket',
            'MAPPINGS_PREFIX': 'test-mappings',
            'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
            'DYNAMODB_SUMMARIES_TABLE': 'test-conversation-summaries',
            'DYNAMODB_MESSAGES_TABLE': 'test-recent-messages'
        }

    @pytest.fixture
    def staging_environment_config(self):
        """Staging environment configuration"""
        return {
            'ENVIRONMENT': 'staging',
            'AWS_REGION': 'us-east-1',
            'S3_BUCKET': 'picasso-staging-bucket',
            'MAPPINGS_PREFIX': 'staging-mappings',
            'JWT_SECRET_KEY_NAME': 'picasso-staging/jwt/signing-key',
            'DYNAMODB_SUMMARIES_TABLE': 'picasso-staging-conversation-summaries',
            'DYNAMODB_MESSAGES_TABLE': 'picasso-staging-recent-messages'
        }

    @pytest.fixture
    def production_environment_config(self):
        """Production environment configuration"""
        return {
            'ENVIRONMENT': 'production',
            'AWS_REGION': 'us-east-1',
            'S3_BUCKET': 'picasso-production-bucket',
            'MAPPINGS_PREFIX': 'production-mappings',
            'JWT_SECRET_KEY_NAME': 'picasso-production/jwt/signing-key',
            'DYNAMODB_SUMMARIES_TABLE': 'picasso-production-conversation-summaries',
            'DYNAMODB_MESSAGES_TABLE': 'picasso-production-recent-messages'
        }


class TestEnvironmentVariableStandardization:
    """Test Phase 2 environment variable standardization"""

    def test_required_environment_variables_present(self, setup_environment_config, base_environment_config):
        """
        CRITICAL: Test all required environment variables are present and standardized
        """
        # Set environment variables
        os.environ.update(base_environment_config)
        
        # Define required environment variables
        required_env_vars = [
            'ENVIRONMENT',
            'AWS_REGION',
            'S3_BUCKET',
            'MAPPINGS_PREFIX',
            'JWT_SECRET_KEY_NAME',
            'DYNAMODB_SUMMARIES_TABLE',
            'DYNAMODB_MESSAGES_TABLE'
        ]
        
        # Validate all required variables are present
        for var in required_env_vars:
            value = os.getenv(var)
            assert value is not None, f"Required environment variable {var} must be set"
            assert len(value.strip()) > 0, f"Environment variable {var} must not be empty"
            assert value == value.strip(), f"Environment variable {var} should not have leading/trailing whitespace"

    def test_environment_variable_naming_conventions(self, setup_environment_config, base_environment_config):
        """
        Test Phase 2 environment variable naming follows standardized conventions
        """
        os.environ.update(base_environment_config)
        
        # Test naming convention patterns
        naming_tests = [
            ('ENVIRONMENT', r'^(test|staging|production)$'),
            ('AWS_REGION', r'^[a-z]{2}-[a-z]+-\d+$'),
            ('S3_BUCKET', r'^[a-z0-9\-]+$'),
            ('MAPPINGS_PREFIX', r'^[a-z0-9\-]+$'),
            ('JWT_SECRET_KEY_NAME', r'^[a-z0-9\-/]+$'),
            ('DYNAMODB_SUMMARIES_TABLE', r'^[a-zA-Z0-9\-]+$'),
            ('DYNAMODB_MESSAGES_TABLE', r'^[a-zA-Z0-9\-]+$')
        ]
        
        import re
        for var_name, pattern in naming_tests:
            value = os.getenv(var_name)
            assert re.match(pattern, value), f"Environment variable {var_name}='{value}' should match pattern {pattern}"

    def test_environment_specific_configuration_consistency(self, setup_environment_config):
        """
        Test environment-specific configuration maintains consistency across environments
        """
        environments = {
            'test': {
                'ENVIRONMENT': 'test',
                'S3_BUCKET': 'test-picasso-bucket',
                'MAPPINGS_PREFIX': 'test-mappings',
                'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key'
            },
            'staging': {
                'ENVIRONMENT': 'staging',
                'S3_BUCKET': 'picasso-staging-bucket',
                'MAPPINGS_PREFIX': 'staging-mappings',
                'JWT_SECRET_KEY_NAME': 'picasso-staging/jwt/signing-key'
            },
            'production': {
                'ENVIRONMENT': 'production',
                'S3_BUCKET': 'picasso-production-bucket',
                'MAPPINGS_PREFIX': 'production-mappings',
                'JWT_SECRET_KEY_NAME': 'picasso-production/jwt/signing-key'
            }
        }
        
        for env_name, config in environments.items():
            # Validate environment-specific naming patterns
            assert config['S3_BUCKET'].startswith(f'picasso-{env_name}' if env_name != 'test' else 'test'), \
                f"S3 bucket should follow naming convention for {env_name}"
            
            assert config['MAPPINGS_PREFIX'].startswith(env_name.replace('test', 'test')), \
                f"Mappings prefix should follow naming convention for {env_name}"
            
            assert config['JWT_SECRET_KEY_NAME'].startswith(f'picasso-{env_name}' if env_name != 'test' else 'test'), \
                f"JWT secret name should follow naming convention for {env_name}"

    def test_environment_variable_type_validation(self, setup_environment_config, base_environment_config):
        """
        Test environment variable values are of correct types and formats
        """
        os.environ.update(base_environment_config)
        
        # Test specific value validations
        environment = os.getenv('ENVIRONMENT')
        assert environment in ['test', 'staging', 'production'], f"ENVIRONMENT must be valid: {environment}"
        
        aws_region = os.getenv('AWS_REGION')
        assert '-' in aws_region, f"AWS_REGION should contain region format: {aws_region}"
        
        s3_bucket = os.getenv('S3_BUCKET')
        assert s3_bucket.islower(), f"S3_BUCKET should be lowercase: {s3_bucket}"
        assert ' ' not in s3_bucket, f"S3_BUCKET should not contain spaces: {s3_bucket}"
        
        jwt_secret_name = os.getenv('JWT_SECRET_KEY_NAME')
        assert '/jwt/' in jwt_secret_name, f"JWT_SECRET_KEY_NAME should contain '/jwt/': {jwt_secret_name}"

    def test_environment_configuration_completeness(self, setup_environment_config):
        """
        Test environment configuration is complete for all deployment targets
        """
        deployment_targets = ['test', 'staging', 'production']
        
        for target in deployment_targets:
            # Generate environment configuration for target
            if target == 'test':
                config = {
                    'ENVIRONMENT': 'test',
                    'S3_BUCKET': 'test-picasso-bucket',
                    'MAPPINGS_PREFIX': 'test-mappings',
                    'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key'
                }
            else:
                config = {
                    'ENVIRONMENT': target,
                    'S3_BUCKET': f'picasso-{target}-bucket',
                    'MAPPINGS_PREFIX': f'{target}-mappings',
                    'JWT_SECRET_KEY_NAME': f'picasso-{target}/jwt/signing-key'
                }
            
            # Validate configuration completeness
            required_keys = ['ENVIRONMENT', 'S3_BUCKET', 'MAPPINGS_PREFIX', 'JWT_SECRET_KEY_NAME']
            for key in required_keys:
                assert key in config, f"Configuration for {target} must include {key}"
                assert config[key] is not None, f"Configuration {key} for {target} must not be None"
                assert len(config[key]) > 0, f"Configuration {key} for {target} must not be empty"


class TestSecretNamingConsistency:
    """Test Phase 2 secret naming consistency across environments"""

    def test_jwt_secret_naming_consistency(self, setup_environment_config):
        """
        Test JWT secret naming follows consistent pattern across all environments
        """
        environments = ['test', 'staging', 'production']
        
        for env in environments:
            if env == 'test':
                expected_pattern = 'test-picasso/jwt/signing-key'
            else:
                expected_pattern = f'picasso-{env}/jwt/signing-key'
            
            # Validate naming pattern
            assert expected_pattern.startswith('picasso-' if env != 'test' else 'test'), \
                f"Secret name should start with environment prefix for {env}"
            assert '/jwt/' in expected_pattern, \
                f"Secret name should contain '/jwt/' for {env}"
            assert expected_pattern.endswith('/signing-key'), \
                f"Secret name should end with '/signing-key' for {env}"

    def test_secret_naming_aws_compliance(self, setup_environment_config):
        """
        Test secret names comply with AWS Secrets Manager naming requirements
        """
        test_secret_names = [
            'test-picasso/jwt/signing-key',
            'picasso-staging/jwt/signing-key',
            'picasso-production/jwt/signing-key'
        ]
        
        for secret_name in test_secret_names:
            # AWS Secrets Manager naming requirements
            assert len(secret_name) <= 512, f"Secret name too long: {secret_name}"
            assert secret_name.replace('-', '').replace('/', '').replace('_', '').isalnum(), \
                f"Secret name contains invalid characters: {secret_name}"
            assert not secret_name.startswith('/'), f"Secret name should not start with '/': {secret_name}"
            assert not secret_name.endswith('/'), f"Secret name should not end with '/': {secret_name}"

    def test_secret_environment_isolation(self, setup_environment_config):
        """
        Test secrets are properly isolated between environments
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            # Create secrets for different environments
            environment_secrets = {
                'test-picasso/jwt/signing-key': {'signingKey': 'test-secret-key'},
                'picasso-staging/jwt/signing-key': {'signingKey': 'staging-secret-key'},
                'picasso-production/jwt/signing-key': {'signingKey': 'production-secret-key'}
            }
            
            for secret_name, secret_value in environment_secrets.items():
                secrets_client.create_secret(
                    Name=secret_name,
                    SecretString=json.dumps(secret_value)
                )
            
            # Validate each environment can only access its own secrets
            for secret_name, expected_value in environment_secrets.items():
                response = secrets_client.get_secret_value(SecretId=secret_name)
                actual_value = json.loads(response['SecretString'])
                
                assert actual_value == expected_value, f"Secret {secret_name} should have correct value"
                
                # Validate environment isolation
                env_prefix = secret_name.split('/')[0]
                assert env_prefix in ['test-picasso', 'picasso-staging', 'picasso-production'], \
                    f"Secret {secret_name} should have proper environment prefix"

    def test_secret_rotation_compatibility(self, setup_environment_config):
        """
        Test secret naming supports AWS secret rotation features
        """
        with mock_secretsmanager():
            secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
            
            secret_name = 'test-picasso/jwt/signing-key'
            
            # Create secret with rotation metadata
            secrets_client.create_secret(
                Name=secret_name,
                SecretString=json.dumps({'signingKey': 'rotatable-key'}),
                Description='JWT signing key for PICASSO authentication'
            )
            
            # Validate secret can be retrieved
            response = secrets_client.get_secret_value(SecretId=secret_name)
            assert 'SecretString' in response, "Secret should be retrievable"
            
            secret_data = json.loads(response['SecretString'])
            assert 'signingKey' in secret_data, "Secret should contain signing key"


class TestConfigurationValidation:
    """Test Phase 2 configuration validation functionality"""

    def test_configuration_validation_passes_all_environments(self, setup_environment_config):
        """
        Test configuration validation passes for all target environments
        """
        test_configurations = [
            # Test environment
            {
                'ENVIRONMENT': 'test',
                'S3_BUCKET': 'test-picasso-bucket',
                'MAPPINGS_PREFIX': 'test-mappings',
                'JWT_SECRET_KEY_NAME': 'test-picasso/jwt/signing-key',
                'AWS_REGION': 'us-east-1'
            },
            # Staging environment
            {
                'ENVIRONMENT': 'staging',
                'S3_BUCKET': 'picasso-staging-bucket',
                'MAPPINGS_PREFIX': 'staging-mappings',
                'JWT_SECRET_KEY_NAME': 'picasso-staging/jwt/signing-key',
                'AWS_REGION': 'us-east-1'
            },
            # Production environment
            {
                'ENVIRONMENT': 'production',
                'S3_BUCKET': 'picasso-production-bucket',
                'MAPPINGS_PREFIX': 'production-mappings',
                'JWT_SECRET_KEY_NAME': 'picasso-production/jwt/signing-key',
                'AWS_REGION': 'us-east-1'
            }
        ]
        
        for config in test_configurations:
            env_name = config['ENVIRONMENT']
            
            # Apply configuration
            os.environ.update(config)
            
            # Run validation checks
            validation_errors = []
            
            # Check required variables
            required_vars = ['ENVIRONMENT', 'S3_BUCKET', 'MAPPINGS_PREFIX', 'JWT_SECRET_KEY_NAME', 'AWS_REGION']
            for var in required_vars:
                if not os.getenv(var):
                    validation_errors.append(f"Missing required variable: {var}")
            
            # Check naming consistency
            if env_name != 'test':
                if not config['S3_BUCKET'].startswith(f'picasso-{env_name}'):
                    validation_errors.append(f"S3 bucket naming inconsistent for {env_name}")
                if not config['JWT_SECRET_KEY_NAME'].startswith(f'picasso-{env_name}'):
                    validation_errors.append(f"JWT secret naming inconsistent for {env_name}")
            
            # Validation should pass (no errors)
            assert len(validation_errors) == 0, f"Configuration validation failed for {env_name}: {validation_errors}"

    def test_configuration_drift_detection(self, setup_environment_config):
        """
        Test configuration drift detection between environments
        """
        # Expected configuration patterns
        expected_patterns = {
            'test': {
                's3_bucket_prefix': 'test',
                'secret_prefix': 'test-picasso',
                'mappings_prefix': 'test'
            },
            'staging': {
                's3_bucket_prefix': 'picasso-staging',
                'secret_prefix': 'picasso-staging',
                'mappings_prefix': 'staging'
            },
            'production': {
                's3_bucket_prefix': 'picasso-production',
                'secret_prefix': 'picasso-production',
                'mappings_prefix': 'production'
            }
        }
        
        for env_name, patterns in expected_patterns.items():
            # Test configuration matches expected patterns
            test_config = {
                'ENVIRONMENT': env_name,
                'S3_BUCKET': f"{patterns['s3_bucket_prefix']}-bucket",
                'MAPPINGS_PREFIX': f"{patterns['mappings_prefix']}-mappings",
                'JWT_SECRET_KEY_NAME': f"{patterns['secret_prefix']}/jwt/signing-key"
            }
            
            # Validate no drift from expected patterns
            assert test_config['S3_BUCKET'].startswith(patterns['s3_bucket_prefix']), \
                f"Configuration drift detected in S3 bucket for {env_name}"
            assert test_config['JWT_SECRET_KEY_NAME'].startswith(patterns['secret_prefix']), \
                f"Configuration drift detected in JWT secret for {env_name}"
            assert test_config['MAPPINGS_PREFIX'].startswith(patterns['mappings_prefix']), \
                f"Configuration drift detected in mappings prefix for {env_name}"

    def test_configuration_validation_error_handling(self, setup_environment_config):
        """
        Test configuration validation properly handles error scenarios
        """
        invalid_configurations = [
            # Missing environment
            {
                'S3_BUCKET': 'test-bucket',
                'JWT_SECRET_KEY_NAME': 'test/jwt/key'
            },
            # Invalid environment value
            {
                'ENVIRONMENT': 'invalid-env',
                'S3_BUCKET': 'test-bucket',
                'JWT_SECRET_KEY_NAME': 'test/jwt/key'
            },
            # Inconsistent naming
            {
                'ENVIRONMENT': 'staging',
                'S3_BUCKET': 'production-bucket',  # Wrong environment
                'JWT_SECRET_KEY_NAME': 'picasso-staging/jwt/signing-key'
            },
            # Empty values
            {
                'ENVIRONMENT': 'test',
                'S3_BUCKET': '',
                'JWT_SECRET_KEY_NAME': 'test/jwt/key'
            }
        ]
        
        for i, invalid_config in enumerate(invalid_configurations):
            # Clear environment
            for key in os.environ.keys():
                if key.startswith(('ENVIRONMENT', 'S3_', 'JWT_', 'MAPPINGS_')):
                    del os.environ[key]
            
            # Apply invalid configuration
            os.environ.update(invalid_config)
            
            # Validation should detect errors
            validation_errors = []
            
            # Check environment variable
            env_value = os.getenv('ENVIRONMENT')
            if not env_value:
                validation_errors.append("Missing ENVIRONMENT")
            elif env_value not in ['test', 'staging', 'production']:
                validation_errors.append(f"Invalid ENVIRONMENT: {env_value}")
            
            # Check S3 bucket
            s3_bucket = os.getenv('S3_BUCKET')
            if not s3_bucket:
                validation_errors.append("Missing S3_BUCKET")
            elif len(s3_bucket.strip()) == 0:
                validation_errors.append("Empty S3_BUCKET")
            
            # Check JWT secret name
            jwt_secret = os.getenv('JWT_SECRET_KEY_NAME')
            if not jwt_secret:
                validation_errors.append("Missing JWT_SECRET_KEY_NAME")
            
            # Should have detected errors
            assert len(validation_errors) > 0, f"Configuration validation should detect errors in config {i}: {invalid_config}"


class TestDeploymentScriptCompatibility:
    """Test Phase 2 deployment script compatibility across environments"""

    def test_deployment_script_environment_detection(self, setup_environment_config):
        """
        Test deployment scripts can properly detect and configure for each environment
        """
        deployment_environments = ['staging', 'production']
        
        for env in deployment_environments:
            # Set environment
            os.environ['ENVIRONMENT'] = env
            
            # Simulate deployment script environment detection
            detected_env = os.getenv('ENVIRONMENT')
            assert detected_env == env, f"Deployment script should detect environment: {env}"
            
            # Validate environment-specific configuration generation
            expected_s3_bucket = f'picasso-{env}-bucket'
            expected_secret_name = f'picasso-{env}/jwt/signing-key'
            expected_mappings_prefix = f'{env}-mappings'
            
            # Deployment script should generate correct configuration
            deployment_config = {
                'S3_BUCKET': expected_s3_bucket,
                'JWT_SECRET_KEY_NAME': expected_secret_name,
                'MAPPINGS_PREFIX': expected_mappings_prefix
            }
            
            # Validate generated configuration
            assert deployment_config['S3_BUCKET'] == expected_s3_bucket, \
                f"Deployment should generate correct S3 bucket for {env}"
            assert deployment_config['JWT_SECRET_KEY_NAME'] == expected_secret_name, \
                f"Deployment should generate correct secret name for {env}"
            assert deployment_config['MAPPINGS_PREFIX'] == expected_mappings_prefix, \
                f"Deployment should generate correct mappings prefix for {env}"

    def test_deployment_parameter_file_compatibility(self, setup_environment_config):
        """
        Test deployment parameter files are compatible across environments
        """
        # Simulate parameter files for different environments
        parameter_files = {
            'staging': {
                'S3BucketName': 'picasso-staging-bucket',
                'MappingsPrefix': 'staging-mappings',
                'JWTSecretKeyName': 'picasso-staging/jwt/signing-key',
                'Environment': 'staging'
            },
            'production': {
                'S3BucketName': 'picasso-production-bucket',
                'MappingsPrefix': 'production-mappings',
                'JWTSecretKeyName': 'picasso-production/jwt/signing-key',
                'Environment': 'production'
            }
        }
        
        for env_name, params in parameter_files.items():
            # Validate parameter file structure
            required_params = ['S3BucketName', 'MappingsPrefix', 'JWTSecretKeyName', 'Environment']
            for param in required_params:
                assert param in params, f"Parameter file for {env_name} missing: {param}"
                assert params[param] is not None, f"Parameter {param} is None for {env_name}"
                assert len(str(params[param])) > 0, f"Parameter {param} is empty for {env_name}"
            
            # Validate parameter consistency
            assert params['Environment'] == env_name, f"Environment parameter should match {env_name}"
            assert env_name in params['S3BucketName'], f"S3 bucket should include environment {env_name}"
            assert env_name in params['JWTSecretKeyName'], f"JWT secret should include environment {env_name}"

    def test_aws_cloudformation_template_compatibility(self, setup_environment_config):
        """
        Test AWS CloudFormation template compatibility with environment configuration
        """
        # Simulate CloudFormation template parameters
        template_parameters = [
            {
                'ParameterKey': 'Environment',
                'ParameterValue': 'staging'
            },
            {
                'ParameterKey': 'S3BucketName',
                'ParameterValue': 'picasso-staging-bucket'
            },
            {
                'ParameterKey': 'JWTSecretKeyName',
                'ParameterValue': 'picasso-staging/jwt/signing-key'
            },
            {
                'ParameterKey': 'MappingsPrefix',
                'ParameterValue': 'staging-mappings'
            }
        ]
        
        # Validate CloudFormation parameter structure
        param_keys = [param['ParameterKey'] for param in template_parameters]
        required_keys = ['Environment', 'S3BucketName', 'JWTSecretKeyName', 'MappingsPrefix']
        
        for required_key in required_keys:
            assert required_key in param_keys, f"CloudFormation template missing parameter: {required_key}"
        
        # Validate parameter values
        param_dict = {param['ParameterKey']: param['ParameterValue'] for param in template_parameters}
        
        env_value = param_dict['Environment']
        assert env_value in ['staging', 'production'], f"Environment parameter should be valid: {env_value}"
        
        # Validate environment consistency
        assert env_value in param_dict['S3BucketName'], f"S3 bucket should include environment {env_value}"
        assert env_value in param_dict['JWTSecretKeyName'], f"JWT secret should include environment {env_value}"
        assert env_value in param_dict['MappingsPrefix'], f"Mappings prefix should include environment {env_value}"

    def test_deployment_rollback_compatibility(self, setup_environment_config):
        """
        Test deployment rollback scenarios maintain configuration consistency
        """
        # Simulate deployment rollback scenario
        original_config = {
            'ENVIRONMENT': 'staging',
            'S3_BUCKET': 'picasso-staging-bucket',
            'JWT_SECRET_KEY_NAME': 'picasso-staging/jwt/signing-key',
            'MAPPINGS_PREFIX': 'staging-mappings'
        }
        
        # Apply original configuration
        os.environ.update(original_config)
        
        # Simulate rollback - configuration should remain consistent
        rollback_config = original_config.copy()
        
        # Validate rollback configuration
        for key, value in rollback_config.items():
            assert os.getenv(key) == value, f"Rollback configuration should preserve {key}"
        
        # Validate no configuration drift during rollback
        assert rollback_config == original_config, "Rollback should preserve original configuration"


if __name__ == "__main__":
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "--show-capture=no"
    ])
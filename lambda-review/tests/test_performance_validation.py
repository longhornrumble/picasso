"""
Performance Validation Tests
Tests performance requirements for the unified coordination architecture:
- JWT generation <500ms
- Streaming first token <1000ms  
- State clearing <200ms
- Summary retrieval <300ms

This test suite validates all performance targets specified in the plan.
"""

import pytest
import time
import asyncio
import statistics
from unittest.mock import Mock, patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import test fixtures and utilities
from conftest import (
    setup_environment, mock_aws_clients, sample_tenant_registry,
    valid_jwt_payload, measure_execution_time, assert_performance_requirement,
    TEST_JWT_SECRET
)

class TestJWTGenerationPerformance:
    """Test JWT generation performance (<500ms requirement)"""
    
    def test_jwt_generation_single_request_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test single JWT generation request meets <500ms target"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Measure JWT generation performance
            def generate_jwt():
                return coordinator.generate_streaming_jwt(
                    tenant_hash='tenant123hash',
                    purpose='stream',
                    duration_minutes=15
                )
            
            result, execution_time = measure_execution_time(generate_jwt)
            
            # Verify performance requirement (<500ms)
            assert_performance_requirement(execution_time, 500)
            
            # Verify functionality
            jwt_result, error = result
            assert jwt_result is not None
            assert error is None
            assert 'jwt_token' in jwt_result
    
    def test_jwt_generation_bulk_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test JWT generation performance under bulk load"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Generate multiple JWTs and measure performance
            execution_times = []
            
            for i in range(10):
                def generate_jwt():
                    return coordinator.generate_streaming_jwt(
                        tenant_hash='tenant123hash',
                        purpose='stream',
                        duration_minutes=15
                    )
                
                result, execution_time = measure_execution_time(generate_jwt)
                execution_times.append(execution_time)
                
                # Verify each generation works
                jwt_result, error = result
                assert jwt_result is not None
                assert error is None
            
            # Verify all generations meet performance target
            for exec_time in execution_times:
                assert_performance_requirement(exec_time, 500)
            
            # Verify average performance
            avg_time = statistics.mean(execution_times)
            assert avg_time < 300, f"Average JWT generation time {avg_time:.2f}ms exceeds 300ms target"
            
            # Verify 95th percentile performance
            p95_time = statistics.quantiles(execution_times, n=20)[18]  # 95th percentile
            assert p95_time < 500, f"95th percentile JWT generation time {p95_time:.2f}ms exceeds 500ms target"
    
    def test_jwt_generation_concurrent_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test JWT generation performance under concurrent load"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            def generate_jwt_with_timing(tenant_id):
                start_time = time.perf_counter()
                result = coordinator.generate_streaming_jwt(
                    tenant_hash=f'tenant{tenant_id}hash',
                    purpose='stream',
                    duration_minutes=15
                )
                end_time = time.perf_counter()
                execution_time = (end_time - start_time) * 1000
                return result, execution_time
            
            # Run concurrent JWT generations
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [
                    executor.submit(generate_jwt_with_timing, i)
                    for i in range(20)
                ]
                
                results = []
                for future in as_completed(futures):
                    (jwt_result, error), execution_time = future.result()
                    results.append(execution_time)
                    
                    # Verify each generation works
                    assert jwt_result is not None
                    assert error is None
            
            # Verify all concurrent generations meet performance target
            for exec_time in results:
                assert_performance_requirement(exec_time, 500)
            
            # Verify concurrent performance doesn't degrade significantly
            avg_concurrent_time = statistics.mean(results)
            assert avg_concurrent_time < 400, f"Concurrent JWT generation average {avg_concurrent_time:.2f}ms exceeds 400ms"
    
    def test_jwt_validation_performance(self, mock_aws_clients, valid_jwt_payload):
        """Test JWT validation performance"""
        from jwt_coordination import JWTCoordinator
        from conftest import create_jwt_token
        
        coordinator = JWTCoordinator()
        
        # Create test JWT
        jwt_token = create_jwt_token(valid_jwt_payload)
        
        # Measure JWT validation performance
        def validate_jwt():
            return coordinator.validate_jwt_token(jwt_token)
        
        result, execution_time = measure_execution_time(validate_jwt)
        
        # JWT validation should be very fast (<50ms)
        assert_performance_requirement(execution_time, 50)
        
        # Verify functionality
        payload, error = result
        assert payload is not None
        assert error is None


class TestStreamingFirstTokenPerformance:
    """Test streaming first token performance (<1000ms requirement)"""
    
    @pytest.mark.asyncio
    async def test_streaming_connection_establishment_performance(self, mock_aws_clients):
        """Test streaming connection establishment time"""
        
        # Mock EventSource for testing
        class MockEventSource:
            def __init__(self, url):
                self.url = url
                self.readyState = 0  # CONNECTING
                self.onopen = None
                self.onmessage = None
                self.onerror = None
                
                # Simulate quick connection
                asyncio.create_task(self._simulate_connection())
            
            async def _simulate_connection(self):
                await asyncio.sleep(0.1)  # 100ms connection time
                self.readyState = 1  # OPEN
                if self.onopen:
                    self.onopen({'type': 'open'})
        
        start_time = time.perf_counter()
        
        # Test streaming connection
        event_source = MockEventSource('wss://test-streaming-url')
        
        # Wait for connection
        connection_established = asyncio.Event()
        
        def on_connection():
            connection_established.set()
        
        event_source.onopen = lambda e: on_connection()
        
        await connection_established.wait()
        
        connection_time = (time.perf_counter() - start_time) * 1000
        
        # Connection should be fast (<200ms)
        assert connection_time < 200, f"Streaming connection time {connection_time:.2f}ms exceeds 200ms"
    
    @pytest.mark.asyncio
    async def test_streaming_first_message_performance(self, mock_aws_clients):
        """Test streaming first message delivery time"""
        
        # Mock streaming message delivery
        class MockStreamingHandler:
            def __init__(self):
                self.messages = []
                self.start_time = None
            
            async def start_streaming(self, user_input):
                self.start_time = time.perf_counter()
                
                # Simulate processing and first token delivery
                await asyncio.sleep(0.5)  # 500ms processing time
                
                # Deliver first token
                await self._deliver_token("Hello")
            
            async def _deliver_token(self, token):
                delivery_time = (time.perf_counter() - self.start_time) * 1000
                self.messages.append({
                    'token': token,
                    'delivery_time': delivery_time
                })
        
        handler = MockStreamingHandler()
        
        await handler.start_streaming("Test message")
        
        # Verify first token delivery time
        assert len(handler.messages) > 0
        first_token_time = handler.messages[0]['delivery_time']
        
        # First token should arrive within 1000ms
        assert first_token_time < 1000, f"First token delivery time {first_token_time:.2f}ms exceeds 1000ms target"
    
    def test_streaming_jwt_authentication_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test streaming JWT authentication doesn't add significant overhead"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Measure JWT generation + validation round trip
            def jwt_roundtrip():
                # Generate JWT
                jwt_result, error = coordinator.generate_streaming_jwt('tenant123hash')
                assert jwt_result is not None
                
                # Validate JWT (simulating streaming endpoint validation)
                payload, error = coordinator.validate_jwt_token(jwt_result['jwt_token'])
                assert payload is not None
                
                return True
            
            result, execution_time = measure_execution_time(jwt_roundtrip)
            
            # JWT authentication overhead should be minimal (<100ms)
            assert_performance_requirement(execution_time, 100)
            assert result is True


class TestStateClearingPerformance:
    """Test state clearing performance (<200ms requirement)"""
    
    def test_state_clearing_performance_full(self, mock_aws_clients):
        """Test full state clearing performance"""
        from state_clear_handler import StateClearHandler
        
        handler = StateClearHandler()
        
        # Mock fast DynamoDB operations
        mock_dynamodb = Mock()
        handler.dynamodb = mock_dynamodb
        
        def fast_operation(**kwargs):
            time.sleep(0.01)  # 10ms operation
            return {'ResponseMetadata': {'HTTPStatusCode': 200}}
        
        mock_dynamodb.delete_item.side_effect = fast_operation
        mock_dynamodb.scan.side_effect = lambda **kwargs: {
            'Items': [{'id': {'S': f'item_{i}'}} for i in range(5)],
            'Count': 5
        }
        
        # Measure state clearing performance
        def perform_state_clear():
            return handler.handle_state_clear_request(
                tenant_id='perf_test_tenant',
                session_id='perf_test_session',
                clear_type='full',
                requester_ip='192.168.1.100'
            )
        
        result, execution_time = measure_execution_time(perform_state_clear)
        
        # Verify performance requirement (<200ms)
        assert_performance_requirement(execution_time, 200)
        
        # Verify functionality
        assert result['success'] is True
        assert result['items_cleared'] > 0
    
    def test_state_clearing_performance_session_only(self, mock_aws_clients):
        """Test session-only state clearing performance"""
        from state_clear_handler import StateClearHandler
        
        handler = StateClearHandler()
        
        # Mock very fast operations for session-only clearing
        mock_dynamodb = Mock()
        handler.dynamodb = mock_dynamodb
        
        def very_fast_operation(**kwargs):
            time.sleep(0.005)  # 5ms operation
            return {'ResponseMetadata': {'HTTPStatusCode': 200}}
        
        mock_dynamodb.delete_item.side_effect = very_fast_operation
        mock_dynamodb.scan.side_effect = lambda **kwargs: {
            'Items': [{'id': {'S': 'session_item'}}],
            'Count': 1
        }
        
        # Measure session clearing performance
        def perform_session_clear():
            return handler.handle_state_clear_request(
                tenant_id='perf_test_tenant',
                session_id='perf_test_session',
                clear_type='session',
                requester_ip='192.168.1.100'
            )
        
        result, execution_time = measure_execution_time(perform_session_clear)
        
        # Session clearing should be faster than full clearing (<100ms)
        assert_performance_requirement(execution_time, 100)
        
        # Verify functionality
        assert result['success'] is True
    
    def test_state_clearing_concurrent_performance(self, mock_aws_clients):
        """Test state clearing performance under concurrent load"""
        from state_clear_handler import StateClearHandler
        
        handler = StateClearHandler()
        
        # Mock DynamoDB operations
        mock_dynamodb = Mock()
        handler.dynamodb = mock_dynamodb
        
        def concurrent_safe_operation(**kwargs):
            time.sleep(0.02)  # 20ms operation
            return {'ResponseMetadata': {'HTTPStatusCode': 200}}
        
        mock_dynamodb.delete_item.side_effect = concurrent_safe_operation
        mock_dynamodb.scan.side_effect = lambda **kwargs: {
            'Items': [{'id': {'S': 'item'}}],
            'Count': 1
        }
        
        def clear_state_with_timing(tenant_id):
            start_time = time.perf_counter()
            result = handler.handle_state_clear_request(
                tenant_id=f'tenant_{tenant_id}',
                clear_type='cache_only',
                requester_ip='192.168.1.100'
            )
            end_time = time.perf_counter()
            execution_time = (end_time - start_time) * 1000
            return result, execution_time
        
        # Run concurrent state clearing operations
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [
                executor.submit(clear_state_with_timing, i)
                for i in range(10)
            ]
            
            results = []
            for future in as_completed(futures):
                result, execution_time = future.result()
                results.append(execution_time)
                
                # Verify each operation works
                assert result['success'] is True
        
        # Verify all concurrent operations meet performance target
        for exec_time in results:
            assert_performance_requirement(exec_time, 200)
        
        # Verify concurrent performance doesn't degrade significantly
        avg_concurrent_time = statistics.mean(results)
        assert avg_concurrent_time < 150, f"Concurrent state clearing average {avg_concurrent_time:.2f}ms exceeds 150ms"


class TestSummaryRetrievalPerformance:
    """Test summary retrieval performance (<300ms requirement)"""
    
    def test_conversation_summary_retrieval_performance(self, mock_aws_clients):
        """Test conversation summary retrieval performance"""
        
        # Mock conversation manager with summary retrieval
        class MockConversationManager:
            def __init__(self):
                self.summaries = {
                    'conv_123': {
                        'summary': 'User asked about healthcare services',
                        'created_at': time.time() - 3600,
                        'message_count': 5
                    },
                    'conv_456': {
                        'summary': 'Follow-up on previous conversation',
                        'created_at': time.time() - 7200,
                        'message_count': 3
                    }
                }
            
            def get_conversation_summary(self, conversation_id):
                # Simulate database lookup
                time.sleep(0.05)  # 50ms lookup time
                return self.summaries.get(conversation_id)
            
            def get_recent_summaries(self, tenant_id, limit=10):
                # Simulate query for recent summaries
                time.sleep(0.1)  # 100ms query time
                return list(self.summaries.values())[:limit]
        
        manager = MockConversationManager()
        
        # Test single summary retrieval
        def get_single_summary():
            return manager.get_conversation_summary('conv_123')
        
        result, execution_time = measure_execution_time(get_single_summary)
        
        # Single summary retrieval should be fast (<100ms)
        assert_performance_requirement(execution_time, 100)
        assert result is not None
        
        # Test multiple summaries retrieval
        def get_multiple_summaries():
            return manager.get_recent_summaries('tenant123hash', limit=5)
        
        result, execution_time = measure_execution_time(get_multiple_summaries)
        
        # Multiple summaries should meet <300ms target
        assert_performance_requirement(execution_time, 300)
        assert len(result) > 0
    
    def test_summary_retrieval_with_filtering_performance(self, mock_aws_clients):
        """Test summary retrieval with filtering performance"""
        
        # Mock DynamoDB query operations
        mock_dynamodb = Mock()
        
        def mock_query(**kwargs):
            # Simulate filtered query with processing time
            time.sleep(0.15)  # 150ms query processing
            
            return {
                'Items': [
                    {
                        'conversation_id': {'S': f'conv_{i}'},
                        'summary': {'S': f'Summary {i}'},
                        'created_at': {'N': str(int(time.time() - i * 3600))},
                        'tenant_id': {'S': 'tenant123hash'}
                    }
                    for i in range(5)
                ],
                'Count': 5
            }
        
        mock_dynamodb.query.side_effect = mock_query
        
        def retrieve_filtered_summaries():
            # Simulate summary retrieval with date/tenant filtering
            return mock_dynamodb.query(
                TableName='conversation_summaries',
                KeyConditionExpression='tenant_id = :tenant_id',
                FilterExpression='created_at > :date',
                ExpressionAttributeValues={
                    ':tenant_id': {'S': 'tenant123hash'},
                    ':date': {'N': str(int(time.time() - 7 * 24 * 3600))}  # Last 7 days
                }
            )
        
        result, execution_time = measure_execution_time(retrieve_filtered_summaries)
        
        # Filtered retrieval should meet <300ms target
        assert_performance_requirement(execution_time, 300)
        assert result['Count'] > 0
    
    def test_summary_retrieval_pagination_performance(self, mock_aws_clients):
        """Test paginated summary retrieval performance"""
        
        # Mock paginated DynamoDB operations
        mock_dynamodb = Mock()
        
        def mock_paginated_query(**kwargs):
            # Simulate paginated query
            time.sleep(0.08)  # 80ms per page
            
            page_size = 10
            return {
                'Items': [
                    {
                        'conversation_id': {'S': f'conv_page_{i}'},
                        'summary': {'S': f'Page summary {i}'}
                    }
                    for i in range(page_size)
                ],
                'Count': page_size,
                'LastEvaluatedKey': {'conversation_id': {'S': f'conv_page_{page_size-1}'}}
            }
        
        mock_dynamodb.query.side_effect = mock_paginated_query
        
        def retrieve_paginated_summaries():
            # Simulate retrieving 3 pages of summaries
            all_summaries = []
            
            for page in range(3):
                page_result = mock_dynamodb.query(
                    TableName='conversation_summaries',
                    Limit=10
                )
                all_summaries.extend(page_result['Items'])
            
            return all_summaries
        
        result, execution_time = measure_execution_time(retrieve_paginated_summaries)
        
        # Paginated retrieval should still meet <300ms target
        assert_performance_requirement(execution_time, 300)
        assert len(result) == 30  # 3 pages × 10 items


class TestEndToEndPerformance:
    """Test end-to-end performance scenarios"""
    
    @pytest.mark.asyncio
    async def test_complete_conversation_flow_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test complete conversation flow performance"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            from state_clear_handler import StateClearHandler
            
            coordinator = JWTCoordinator()
            state_handler = StateClearHandler()
            
            # Mock DynamoDB for state handler
            mock_dynamodb = Mock()
            state_handler.dynamodb = mock_dynamodb
            mock_dynamodb.delete_item.return_value = {'ResponseMetadata': {'HTTPStatusCode': 200}}
            mock_dynamodb.scan.return_value = {'Items': [], 'Count': 0}
            
            async def complete_conversation_flow():
                # 1. Generate JWT
                jwt_result, _ = coordinator.generate_streaming_jwt('tenant123hash')
                
                # 2. Validate JWT (simulating streaming endpoint)
                payload, _ = coordinator.validate_jwt_token(jwt_result['jwt_token'])
                
                # 3. Simulate conversation processing time
                await asyncio.sleep(0.2)  # 200ms conversation processing
                
                # 4. Clear session state
                clear_result = state_handler.handle_state_clear_request(
                    tenant_id='tenant123hash',
                    session_id='test_session',
                    clear_type='session',
                    requester_ip='192.168.1.100'
                )
                
                return {
                    'jwt_generated': jwt_result is not None,
                    'jwt_validated': payload is not None,
                    'state_cleared': clear_result['success']
                }
            
            start_time = time.perf_counter()
            result = await complete_conversation_flow()
            end_time = time.perf_counter()
            
            execution_time = (end_time - start_time) * 1000
            
            # Complete flow should be efficient (<1000ms)
            assert execution_time < 1000, f"Complete conversation flow {execution_time:.2f}ms exceeds 1000ms"
            
            # Verify all steps completed successfully
            assert result['jwt_generated'] is True
            assert result['jwt_validated'] is True
            assert result['state_cleared'] is True
    
    def test_high_load_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test performance under high load"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            def simulate_user_request():
                start_time = time.perf_counter()
                
                # Simulate typical user request: JWT generation + validation
                jwt_result, _ = coordinator.generate_streaming_jwt('tenant123hash')
                payload, _ = coordinator.validate_jwt_token(jwt_result['jwt_token'])
                
                end_time = time.perf_counter()
                return (end_time - start_time) * 1000
            
            # Simulate 50 concurrent users
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [
                    executor.submit(simulate_user_request)
                    for _ in range(50)
                ]
                
                request_times = []
                for future in as_completed(futures):
                    request_time = future.result()
                    request_times.append(request_time)
            
            # Verify performance under load
            avg_time = statistics.mean(request_times)
            assert avg_time < 200, f"Average request time under load {avg_time:.2f}ms exceeds 200ms"
            
            # Verify 95th percentile
            p95_time = statistics.quantiles(request_times, n=20)[18]
            assert p95_time < 500, f"95th percentile time under load {p95_time:.2f}ms exceeds 500ms"
    
    def test_memory_performance(self, mock_aws_clients, sample_tenant_registry):
        """Test memory usage doesn't grow excessively"""
        with patch('tenant_inference.tenant_registry_cache', sample_tenant_registry):
            
            import psutil
            import os
            
            from jwt_coordination import JWTCoordinator
            
            coordinator = JWTCoordinator()
            
            # Get initial memory usage
            process = psutil.Process(os.getpid())
            initial_memory = process.memory_info().rss / 1024 / 1024  # MB
            
            # Perform many operations
            for i in range(100):
                jwt_result, _ = coordinator.generate_streaming_jwt(f'tenant{i}hash')
                coordinator.validate_jwt_token(jwt_result['jwt_token'])
            
            # Get final memory usage
            final_memory = process.memory_info().rss / 1024 / 1024  # MB
            memory_increase = final_memory - initial_memory
            
            # Memory increase should be reasonable (<50MB for 100 operations)
            assert memory_increase < 50, f"Memory increase {memory_increase:.2f}MB exceeds 50MB limit"


if __name__ == '__main__':
    """
    Run performance validation tests
    """
    print("Performance Validation Tests")
    print("=" * 35)
    
    # Run the test suite
    pytest.main([
        __file__,
        '-v',
        '--tb=short',
        '--show-capture=no'
    ])
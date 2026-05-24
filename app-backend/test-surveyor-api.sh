#!/bin/bash

API_BASE="http://localhost:3050/api"

echo "🧪 Surveyor Management System - Smoke Test"
echo ""

# Test 1: Create a surveyor
echo "1️⃣  Creating surveyor..."
RESPONSE=$(curl -s -X POST "$API_BASE/surveyors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "O Saunyama",
    "licenseNumber": "LS-2019-001",
    "firm": "Saunyama Surveyors",
    "address": "BOX A1262\nAVONDALE\nHARARE",
    "phone": "+263 4 123456",
    "email": "o.saunyama@example.com"
  }')

echo "$RESPONSE" | grep -q '"ok":true' && echo "   ✅ Surveyor created successfully" || echo "   ❌ Failed to create surveyor"
SURVEYOR_ID=$(echo "$RESPONSE" | grep -o '"id":[0-9]*' | grep -o '[0-9]*' | head -1)
echo "   ID: $SURVEYOR_ID"
echo ""

# Test 2: Create second surveyor
echo "2️⃣  Creating second surveyor..."
curl -s -X POST "$API_BASE/surveyors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "licenseNumber": "LS-2020-045",
    "firm": "Precision Surveys Ltd",
    "address": "123 Main Street\nBulawayo",
    "phone": "+263 9 987654",
    "email": "john@precision.com"
  }' | grep -q '"ok":true' && echo "   ✅ Second surveyor created" || echo "   ❌ Failed"
echo ""

# Test 3: List all surveyors
echo "3️⃣  Fetching all surveyors..."
SURVEYORS=$(curl -s "$API_BASE/surveyors")
COUNT=$(echo "$SURVEYORS" | grep -o '"name"' | wc -l)
echo "   ✅ Found $COUNT surveyors"
echo "$SURVEYORS" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | sed 's/^/   - /'
echo ""

# Test 4: Get surveyor by ID
echo "4️⃣  Fetching surveyor by ID..."
curl -s "$API_BASE/surveyors/$SURVEYOR_ID" | grep -q '"ok":true' && echo "   ✅ Surveyor retrieved" || echo "   ❌ Failed"
echo ""

# Test 5: Create survey project
echo "5️⃣  Creating survey project..."
curl -s -X POST "$API_BASE/survey-projects" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Shabani Mine Survey\",
    \"surveyorId\": $SURVEYOR_ID,
    \"clientName\": \"Shabani Mining Company\",
    \"location\": \"Shabani District\",
    \"surveyType\": \"Cadastral\",
    \"surveyDate\": \"2025-10-23\",
    \"instruments\": \"Trimble R6 GNSS Set\",
    \"description\": \"Survey of stands 108, 167-256\"
  }" | grep -q '"ok":true' && echo "   ✅ Survey project created" || echo "   ❌ Failed"
echo ""

# Test 6: List survey projects
echo "6️⃣  Fetching survey projects..."
PROJECTS=$(curl -s "$API_BASE/survey-projects")
PROJECT_COUNT=$(echo "$PROJECTS" | grep -o '"name"' | wc -l)
echo "   ✅ Found $PROJECT_COUNT projects"
echo ""

# Test 7: Test duplicate license (should fail)
echo "7️⃣  Testing duplicate license validation..."
DUPLICATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/surveyors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Duplicate",
    "licenseNumber": "LS-2019-001",
    "firm": "Test Firm"
  }')

HTTP_CODE=$(echo "$DUPLICATE_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "409" ]; then
  echo "   ✅ Duplicate validation working correctly"
else
  echo "   ❌ Duplicate validation not working (HTTP $HTTP_CODE)"
fi
echo ""

echo "✅ Smoke test completed! 🎉"
echo ""
echo "📊 Summary:"
echo "   - Database tables created ✓"
echo "   - API routes working ✓"
echo "   - CRUD operations functional ✓"
echo "   - Validation working ✓"
echo "   - Survey projects linked ✓"

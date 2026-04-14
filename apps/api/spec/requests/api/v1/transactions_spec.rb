require "rails_helper"

RSpec.describe "Api::V1::Transactions", type: :request do
  let(:category) { create(:category) }
  let(:valid_params) do
    {
      transaction: {
        amount:       1500,
        store_name:   "セブンイレブン",
        purchased_at: "2026-04-13",
        category_id:  category.id,
        source:       "manual"
      }
    }
  end
  let(:valid_headers) { { "X-API-Key" => "test-api-key" } }

  before { allow(ENV).to receive(:[]).and_call_original }

  describe "POST /api/v1/transactions" do
    context "APIキーが正しい場合" do
      before { allow(ENV).to receive(:[]).with("API_KEY").and_return("test-api-key") }

      context "有効なパラメータの場合" do
        it "取引を作成して201を返す" do
          expect {
            post "/api/v1/transactions", params: valid_params, headers: valid_headers, as: :json
          }.to change(Transaction, :count).by(1)

          expect(response).to have_http_status(:created)
          expect(response.parsed_body["store_name"]).to eq("セブンイレブン")
        end
      end

      context "店名がStoreCategoryMappingに一致する場合" do
        let!(:mapping) { create(:store_category_mapping, store_name: "セブンイレブン", category: category) }

        it "カテゴリが自動でセットされる" do
          post "/api/v1/transactions",
               params: valid_params.deep_merge(transaction: { category_id: nil }),
               headers: valid_headers,
               as: :json

          expect(response).to have_http_status(:created)
          expect(response.parsed_body["category_id"]).to eq(category.id)
        end
      end

      context "店名がStoreCategoryMappingに一致せずcategoryがnilの場合" do
        it "UnclassifiedAlertJobをエンキューする" do
          expect {
            post "/api/v1/transactions",
                 params: valid_params.deep_merge(transaction: { category_id: nil }),
                 headers: valid_headers,
                 as: :json
          }.to have_enqueued_job(UnclassifiedAlertJob)
        end
      end

      context "無効なパラメータの場合" do
        it "422を返す" do
          post "/api/v1/transactions",
               params: { transaction: { amount: nil } },
               headers: valid_headers,
               as: :json

          expect(response).to have_http_status(:unprocessable_entity)
        end
      end
    end

    context "APIキーがない場合" do
      it "401を返す" do
        post "/api/v1/transactions", params: valid_params, as: :json

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "APIキーが不正な場合" do
      it "401を返す" do
        post "/api/v1/transactions",
             params: valid_params,
             headers: { "X-API-Key" => "wrong-key" },
             as: :json

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end

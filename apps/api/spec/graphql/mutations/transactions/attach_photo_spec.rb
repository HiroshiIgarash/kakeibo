# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Transactions::AttachPhoto do
  let(:transaction) { create(:transaction) }
  let(:uploaded_file) do
    Rack::Test::UploadedFile.new(
      Rails.root.join("spec/fixtures/files/test_image.jpg"),
      "image/jpeg"
    )
  end

  describe "正常系" do
    it "photoを添付できる" do
      result = ApiSchema.execute(
        mutation_string,
        variables: { input: { transactionId: transaction.id, photo: uploaded_file } }
      )

      expect(result["errors"]).to be_nil
      transaction.reload
      expect(transaction.photo).to be_attached
    end
  end

  describe "異常系" do
    it "存在しないtransaction_idの場合はエラーを返す" do
      result = ApiSchema.execute(
        mutation_string,
        variables: { input: { transactionId: 0, photo: uploaded_file } }
      )

      expect(result["errors"]).to be_present
    end
  end

  def mutation_string
    <<~GQL
      mutation AttachPhoto($input: AttachPhotoInput!) {
        attachPhoto(input: $input) {
          transaction {
            id
          }
        }
      }
    GQL
  end
end

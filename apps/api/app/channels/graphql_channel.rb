class GraphqlChannel < ApplicationCable::Channel
  def subscribed
    @subscription_ids = []
  end

  def execute(data)
    result = ApiSchema.execute(
      query: data["query"],
      context: {
        channel: self,
        subscription_ids: @subscription_ids
      },
      variables: data["variables"],
      operation_name: data["operationName"]
    )

    payload = { result: result.to_h, more: result.subscription? }
    transmit(payload)
  end

  def unsubscribed
    @subscription_ids.each do |sid|
      ApiSchema.subscriptions.delete_subscription(sid)
    end
  end
end

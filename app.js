(function() {
  "use strict";

  return {
    childRegex: /child_of:(\d*)/,
    parentRegex: /parent_of:(\d*)/,
    customFieldRegex: /custom_field_(\d+)/,
    relation: {},
    sub_category: "",
    defaultTicketAttributes: {
      "custom_fields": []
    },

    requests: {
      'createTicket': function(attributes){
        return {
          url: '/api/v2/tickets.json',
          type: 'POST',
          dataType: 'json',
          data: JSON.stringify(attributes),
          contentType: 'application/json',
          proxy_v2: true,
          processData: false
        };
      },

      'fetchTicket': function(id) {
        return {
          url: '/api/v2/tickets/'+ id +'.json?include=groups,users',
          type: 'GET',
          dataType: 'json',
          proxy_v2: true
        };
      },

      'updateTicket': function(id, attributes){
        return {
          url: '/api/v2/tickets/' + id + '.json',
          type: 'PUT',
          dataType: 'json',
          data: JSON.stringify(attributes),
          contentType: 'application/json',
          proxy_v2: true,
          processData: false
        };
      }
    },

    events: {
      'app.created'           : 'deferredInitialize',
      'ticket.save'           : 'saveHook',
      'fetchTicket.done'      : 'displayRelation',
      'change .sub_category'  : 'showBody',
      'click .btn-confirm'    : 'fireAction'
    },

    deferredInitialize: function(){
      var self = this;

      _.defer(function(){
        self.initialize();
      });
    },

    initialize: function() {
      this.ticketFields('custom_field_' + this.setting('ancestry')).hide();

      if (this.isChild() || this.isParent())
        return this.ajax('fetchTicket', this.childID() || this.parentID());

      this.switchTo('categories');
    },

    saveHook: function(){
      if(!(this.isChild() || this.isParent()))
        return true;

      if (this.isParent() &&
          this.ticket().status() == 'solved' &&
          this.relation.status !== 'solved')
        return this.I18n.t('messages.solve_child_first');

      var attributes = {};

      if (this.isChild() &&
          this.comment().type().match("internal")){
        attributes.comment = {
          "body": "%@:\n%@".fmt(this.I18n.t("messages.comment_from_child"), this.comment().text()),
          "public": false
        };
      }

      if (this.ticket().status() == 'solved' &&
          this.setting('resolution_field')) {
        this.ticket().customField('custom_field_' + this.setting('resolution_field'), true);
        attributes.custom_fields = [ { id: Number(this.setting('resolution_field')), value: true } ];
      }

      if (attributes)
        return this.promise(function(done, fail){
          this.ajax('updateTicket', this.childID() || this.parentID(), { ticket: attributes })
            .fail(function(data){ fail(this.I18n.t("messages.relation_update_failed", { error: data.responseText})); })
            .then(done.bind(done));
        });

      return true;
    },

    showBody: function() {
      this.sub_category = this.$('.sub_category').val();

      if(this.sub_category == "-1") {
        this.$('.comment-form').hide();
      } else {
          var body = this.I18n.t('escalation.subcategories.' + this.sub_category + '.body');
          this.$('.additional-comment').val(body);
          this.$('.comment-form').show();
      }
    },

    fireAction: function(){
      var config = this.findConfigByEscalationReason(this.sub_category),
          attributes = _.defaults(config.attributes, this.defaultTicketAttributes);

      attributes = this.appendAdditionalComment(attributes);
      attributes = this.interpolateWithContext(attributes);

      this.createChildTicket(attributes);
    },

    findConfigByEscalationReason: function(sub_category){
      return _.clone(_.find(this.config(), function(i) {
        return i.escalation_reason === sub_category;
      }));
    },

    preventMalformedJson: function(ticket) {
      for(var field in ticket) {
        if(typeof ticket[field] == "string") {
          ticket[field] = ticket[field].replace(/\\/g, '\\\\');
          ticket[field] = ticket[field].replace(/"/g, '\\"');
        }
      }
    },

    interpolateWithContext: function(obj){
      var context = _.extend(
        _.clone(this.containerContext()),
        this.currentUserContext()
      );

      context.ticket.id = this.ticket().id();

      try {
        this.preventMalformedJson(context.ticket);
        var temp_template = _.template(JSON.stringify(obj), { interpolate : /\{\{(.+?)\}\}/g });
        return JSON.parse(temp_template(context));
      } catch(error){
        services.notify('%@: %@'.fmt(this.I18n.t('messages.parse_error'), error.message), 'error');
        this.initialize();
      }
    },

    appendAdditionalComment: function(attributes){
      var comment = this.$('textarea.additional-comment').val();

      if (!_.isEmpty(comment)){
        attributes.comment = attributes.comment || {};
        attributes.comment.body = attributes.comment.body || '';
        attributes.comment.body += '\n' + comment;
      }

      return attributes;
    },

    createChildTicket: function(attributes){
      this.switchTo('spinner');

      attributes.custom_fields = _.filter(attributes.custom_fields, function(field) {
        return !_.isEmpty(field.value) && !_.contains(["undefined", "null", "-"], field.value);
      });

      attributes.custom_fields.push({
        id: this.setting('ancestry'),
        value: "child_of:" + this.ticket().id()
      });

      this.ajax('createTicket', { ticket: attributes })
        .done(function(data) { this.setChildTicket(data.ticket); });
    },

    setChildTicket: function(ticket){
      var new_ancestry_value = 'parent_of:' + ticket.id;
      this.ticket().customField('custom_field_' + this.setting('ancestry'), new_ancestry_value);

      var new_child_value = '' + ticket.id;
      this.ticket().customField('custom_field_' + this.setting('child_field'), new_child_value);

      var new_escalation_value = 'parent_ticket';
      this.ticket().customField('custom_field_' + this.setting('escalation_field'), new_escalation_value);

      var new_escalation_reason = this.sub_category;
      this.ticket().customField('custom_field_' + this.setting('escalation_reason'), new_escalation_reason);

      this.ajax('updateTicket', this.ticket().id(), { ticket: {
        custom_fields: [
          { id: this.setting('ancestry'), value: new_ancestry_value },
          { id: this.setting('child_field'), value: new_child_value },
          { id: this.setting('escalation_field'), value: new_escalation_value },
          { id: this.setting('escalation_reason'), value: new_escalation_reason }
        ]
      }});

      this.displayRelation({ ticket: ticket });
    },

    displayRelation: function(data){
      this.relation = data.ticket;

      this.switchTo('relation', {
        ticket: data.ticket,
        is_child: !!this.isChild()
      });
    },

    currentUserContext: function(){
      var context = { current_user: {} };

      if (this.currentUser()){
        var names = this.splitUsername(this.currentUser().name());

        context.current_user = {
          id: this.currentUser().id(),
          email: this.currentUser().email(),
          name: this.currentUser().name(),
          firstname: names.firstname,
          lastname: names.lastname,
          externalId: this.currentUser().externalId()
        };
      }
      return context;
    },

    splitUsername: function(username){
      var names = username.split(' ');
      var obj = {
        firstname: '',
        lastname: ''
      };

      if (!_.isEmpty(names)){
        obj.firstname = names.shift();

        if (!_.isEmpty(names)){
          obj.lastname = names.join(' ');
        }
      }

      return obj;
    },

    config: function(){
      return JSON.parse(this.setting('config'));
    },

    ancestryValue: function(){
      return this.ticket().customField("custom_field_" + this.setting('ancestry'));
    },

    isParent: function(){
      return this.parentRegex.test(this.ancestryValue());
    },

    isChild: function(){
      return this.childRegex.test(this.ancestryValue());
    },

    childID: function(){
      if (this.isParent())
        return this.parentRegex.exec(this.ancestryValue())[1];
    },

    parentID: function(){
      if (this.isChild())
        return this.childRegex.exec(this.ancestryValue())[1];
    }
  };
}());
